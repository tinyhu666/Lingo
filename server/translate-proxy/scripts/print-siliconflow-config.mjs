import { createSiliconFlowLatencyFirstRuntimeConfig } from '../src/runtime-config.mjs';

const args = process.argv.slice(2);

const getArgValue = (prefix) => {
  const matched = args.find((item) => item.startsWith(`${prefix}=`));
  return matched ? matched.slice(prefix.length + 1) : '';
};

const format = getArgValue('--format') || 'json';
const adminUrl = getArgValue('--url').replace(/\/+$/, '');
const tokenPlaceholder = getArgValue('--token') || 'YOUR_ADMIN_TOKEN';

const config = createSiliconFlowLatencyFirstRuntimeConfig();

if (format === 'curl') {
  if (!adminUrl) {
    console.error('Missing --url=https://your-domain.example.com');
    process.exit(1);
  }

  const payload = JSON.stringify(config, null, 2)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\"'\"'");

  console.log(`curl -X PUT "${adminUrl}/admin/runtime-config" \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -H "Authorization: Bearer ${tokenPlaceholder}" \\`);
  console.log(`  -d '${payload}'`);
  process.exit(0);
}

console.log(JSON.stringify(config, null, 2));
