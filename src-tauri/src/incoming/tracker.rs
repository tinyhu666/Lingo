//! Line deduplication and `sender: text` parsing for OCR output.
//!
//! Each OCR frame returns roughly the same set of visible lines for as long
//! as nothing new arrives. The tracker filters those repeats so the
//! translation lane only sees each chat message once.
//!
//! This module is platform-agnostic and is the only fully-implemented part of
//! the `incoming` subsystem at this stage.

use crate::incoming::ocr::TextLine;
use crate::incoming::MessageScope;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// One new chat message worth translating.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewMessage {
    pub sender: Option<String>,
    pub text: String,
    /// `Some(MessageScope::Team|All)` if we could read a scope tag at the
    /// start of the line, otherwise `None`. OCR garbles brackets often
    /// enough that we treat scope as a best-effort signal.
    pub scope: Option<MessageScope>,
}

#[derive(Debug, Clone)]
struct Recent {
    hash: u64,
    last_seen: Instant,
}

/// Bounded LRU-style cache of recently-emitted line hashes. Lines within the
/// `cooldown` are suppressed; older identical lines are allowed through again
/// in case the same phrase legitimately repeats much later.
pub struct LineTracker {
    history: VecDeque<Recent>,
    capacity: usize,
    cooldown: Duration,
}

impl Default for LineTracker {
    fn default() -> Self {
        Self::new(128, Duration::from_secs(45))
    }
}

impl LineTracker {
    pub fn new(capacity: usize, cooldown: Duration) -> Self {
        Self {
            history: VecDeque::with_capacity(capacity),
            capacity,
            cooldown,
        }
    }

    /// Process one OCR frame and return any newly-seen lines.
    pub fn ingest(&mut self, lines: &[TextLine]) -> Vec<NewMessage> {
        let now = Instant::now();
        let mut emitted = Vec::new();

        // Garbage-collect expired entries so the history is bounded under
        // load even if `capacity` would otherwise be exceeded.
        self.evict_expired(now);

        for line in lines {
            let Some(msg) = parse_line(&line.text) else {
                continue;
            };
            let hash = hash_normalized(msg.sender.as_deref(), &msg.text);
            if self.is_fresh(hash, now) {
                self.remember(hash, now);
                emitted.push(msg);
            }
        }
        emitted
    }

    fn is_fresh(&self, hash: u64, now: Instant) -> bool {
        !self
            .history
            .iter()
            .any(|entry| entry.hash == hash && now.duration_since(entry.last_seen) < self.cooldown)
    }

    fn remember(&mut self, hash: u64, now: Instant) {
        if self.history.len() >= self.capacity {
            self.history.pop_front();
        }
        self.history.push_back(Recent {
            hash,
            last_seen: now,
        });
    }

    fn evict_expired(&mut self, now: Instant) {
        let cutoff = self.cooldown;
        while let Some(front) = self.history.front() {
            if now.duration_since(front.last_seen) >= cutoff {
                self.history.pop_front();
            } else {
                break;
            }
        }
    }
}

/// Strip the leading `[scope]` tag (ASCII or full-width brackets), capture
/// the scope label if recognizable, and split on the first `:` / `：` to
/// extract `Sender: message`.
fn parse_line(raw: &str) -> Option<NewMessage> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Strip a leading bracketed scope tag if present. Tolerates ASCII `[…]`
    // and full-width `［…］`. OCR sometimes garbles the inside of the
    // brackets; we strip it regardless of content but capture the scope
    // when we can recognize it.
    let (after_scope, scope) = match strip_leading_bracket(trimmed) {
        Some((rest, tag)) => (rest, detect_scope(tag)),
        None => (trimmed, None),
    };

    // Look for the first colon (ASCII or full-width).
    let colon_idx = after_scope
        .char_indices()
        .find(|(_, c)| matches!(c, ':' | '：'))
        .map(|(i, c)| (i, c.len_utf8()));

    if let Some((idx, colon_len)) = colon_idx {
        let sender = after_scope[..idx].trim();
        let text = after_scope[idx + colon_len..].trim();
        if !sender.is_empty() && !text.is_empty() && sender.chars().count() <= 32 {
            return Some(NewMessage {
                sender: Some(sender.to_string()),
                text: text.to_string(),
                scope,
            });
        }
    }

    Some(NewMessage {
        sender: None,
        text: after_scope.to_string(),
        scope,
    })
}

/// Returns `Some((remainder_after_bracket, tag_contents))` if the input
/// starts with a recognized opening bracket and contains its matching
/// closer; the `tag_contents` slice excludes both brackets so callers can
/// run keyword detection on the inside.
fn strip_leading_bracket(s: &str) -> Option<(&str, &str)> {
    let mut chars = s.char_indices();
    let (_, first) = chars.next()?;
    let close = match first {
        '[' => ']',
        '［' => '］',
        '【' => '】',
        _ => return None,
    };
    let content_start = first.len_utf8();
    for (idx, c) in chars {
        if c == close {
            let tag_contents = &s[content_start..idx];
            let rest = s[idx + c.len_utf8()..].trim_start();
            return Some((rest, tag_contents));
        }
    }
    None
}

/// Look at the bracket contents and guess which channel this line came
/// from. Tolerates OCR-garbled tags by matching against multiple
/// localisations and ignoring case. Returns `None` if the tag is
/// unrecognizable — the line will still ship without a scope hint.
fn detect_scope(tag: &str) -> Option<MessageScope> {
    let lower: String = tag.chars().flat_map(char::to_lowercase).collect();

    // Chinese: 全部 = All, 队伍 = Team (and 队 alone often survives garbling).
    if tag.contains('全') {
        return Some(MessageScope::All);
    }
    if tag.contains('队') {
        return Some(MessageScope::Team);
    }
    // English / Russian / generic.
    if lower.contains("all") || lower.contains("обще") {
        return Some(MessageScope::All);
    }
    if lower.contains("team") || lower.contains("союз") || lower.contains("кома") {
        return Some(MessageScope::Team);
    }
    None
}

fn hash_normalized(sender: Option<&str>, text: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    if let Some(s) = sender {
        normalize_sender(s).hash(&mut hasher);
    }
    normalize_text(text).hash(&mut hasher);
    hasher.finish()
}

fn normalize_sender(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalize_text(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace() && !is_strip_punct(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_strip_punct(c: char) -> bool {
    matches!(
        c,
        '.' | ','
            | '!'
            | '?'
            | ';'
            | '\''
            | '"'
            | '。'
            | '，'
            | '！'
            | '？'
            | '；'
            | '\u{201C}'
            | '\u{201D}'
            | '\u{2018}'
            | '\u{2019}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::incoming::region::Rect;

    fn line(text: &str) -> TextLine {
        TextLine {
            text: text.to_string(),
            confidence: 0.5,
            bbox: Rect {
                x: 0,
                y: 0,
                w: 100,
                h: 20,
            },
        }
    }

    #[test]
    fn extracts_sender_and_text_ascii() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[Team] Pudge: gg wp")]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].sender.as_deref(), Some("Pudge"));
        assert_eq!(out[0].text, "gg wp");
        assert_eq!(out[0].scope, Some(MessageScope::Team));
    }

    #[test]
    fn extracts_with_fullwidth_brackets_and_colon() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("［队伍］Crystal：我们去打肉山")]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].sender.as_deref(), Some("Crystal"));
        assert_eq!(out[0].text, "我们去打肉山");
        assert_eq!(out[0].scope, Some(MessageScope::Team));
    }

    #[test]
    fn detects_all_scope_chinese() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[全部] Lion: gg")]);
        assert_eq!(out[0].scope, Some(MessageScope::All));
    }

    #[test]
    fn detects_all_scope_english() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[All] Pudge: smoke now")]);
        assert_eq!(out[0].scope, Some(MessageScope::All));
    }

    #[test]
    fn scope_none_for_unrecognized_tag() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[BA fa] Templar: no buyback on enemy carry")]);
        assert_eq!(out[0].scope, None);
    }

    #[test]
    fn scope_none_when_no_tag() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("server reconnecting")]);
        assert_eq!(out[0].scope, None);
    }

    #[test]
    fn tolerates_garbled_scope_tag() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[BA fa] Templar: no buyback on enemy carry")]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].sender.as_deref(), Some("Templar"));
        assert_eq!(out[0].text, "no buyback on enemy carry");
    }

    #[test]
    fn deduplicates_within_cooldown() {
        let mut t = LineTracker::default();
        let first = t.ingest(&[line("[All] Lion: GG!")]);
        let second = t.ingest(&[line("[All] Lion: gg")]);
        assert_eq!(first.len(), 1);
        assert!(
            second.is_empty(),
            "case + punctuation should collapse to same hash"
        );
    }

    #[test]
    fn distinct_senders_are_not_collapsed() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("[Team] Pudge: gg"), line("[Team] Lion: gg")]);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn line_without_colon_emits_text_only() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line("server reconnecting")]);
        assert_eq!(out.len(), 1);
        assert!(out[0].sender.is_none());
        assert_eq!(out[0].text, "server reconnecting");
    }

    #[test]
    fn empty_and_whitespace_lines_are_skipped() {
        let mut t = LineTracker::default();
        let out = t.ingest(&[line(""), line("   "), line("\t")]);
        assert!(out.is_empty());
    }
}
