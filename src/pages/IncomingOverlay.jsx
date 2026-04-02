import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { hasTauriRuntime } from '../services/tauriRuntime';

const OVERLAY_EVENT_NAME = 'incoming_chat_overlay_update';

export default function IncomingOverlay() {
  const [messages, setMessages] = useState([]);
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let unlisten = null;

    const bind = async () => {
      try {
        unlisten = await listen(OVERLAY_EVENT_NAME, (event) => {
          const payload = event.payload || {};
          const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
          const durationMs = Number(payload.durationMs) || 6000;

          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
          }

          setMessages(nextMessages);
          setVisible(nextMessages.length > 0);

          hideTimerRef.current = window.setTimeout(() => {
            setVisible(false);
          }, durationMs);
        });

        if (disposed && unlisten) {
          unlisten();
          unlisten = null;
        }
      } catch (error) {
        console.error('Failed to bind incoming overlay listener', error);
      }
    };

    void bind();

    return () => {
      disposed = true;
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div className='pointer-events-none flex h-full w-full items-start justify-start overflow-hidden p-3'>
      <div
        className={`w-full max-w-[520px] transition-all duration-200 ${
          visible && messages.length > 0 ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}>
        <div className='flex flex-col gap-2 rounded-[24px] border border-white/20 bg-[rgba(8,12,20,0.78)] p-3 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl'>
          {messages.map((message) => (
            <div
              key={message.id}
              className='rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.06)] px-3 py-2'>
              <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60'>
                {[message.channel, message.speaker].filter(Boolean).join(' / ') || 'LINGO'}
              </div>
              <div className='mt-1 text-[15px] font-semibold leading-6 text-white'>
                {message.translated_text}
              </div>
              {message.original_text ? (
                <div className='mt-1 text-xs leading-5 text-white/52'>{message.original_text}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
