const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Locate mkcert binary
const possibleMkcertPaths = [
  'mkcert',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe', 'mkcert.exe'),
  path.join(process.env.ProgramFiles || '', 'mkcert', 'mkcert.exe'),
  path.join(process.env.ProgramFiles || '', 'Git', 'usr', 'bin', 'mkcert.exe')
];

let mkcertBin = null;
for (const p of possibleMkcertPaths) {
  try {
    const test = spawnSync(p, ['-version'], { encoding: 'utf8' });
    if (test.status === 0) {
      mkcertBin = p;
      break;
    }
  } catch (e) {}
}

if (!mkcertBin) {
  console.error('❌ mkcert binary not found.');
  console.error('Please install mkcert via: winget install FiloSottile.mkcert');
  process.exit(1);
}

console.log(`✅ Using mkcert binary: ${mkcertBin}`);

// Get local IPv4 addresses dynamically
const localIps = [];
const ifaces = os.networkInterfaces();
for (const name of Object.keys(ifaces)) {
  for (const net of ifaces[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      localIps.push(net.address);
    }
  }
}

const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');
const domains = ['localhost', '127.0.0.1', ...localIps, '::1'];

console.log('Generating development TLS certificate for domains:', domains.join(', '));
const genRes = spawnSync(mkcertBin, ['-key-file', keyPath, '-cert-file', certPath, ...domains], {
  encoding: 'utf8'
});

if (genRes.status !== 0) {
  console.error('Failed to generate certificates:', genRes.stderr || genRes.stdout);
  process.exit(1);
}
console.log('✅ Generated server key and certificate:');
console.log(`   Key : ${keyPath}`);
console.log(`   Cert: ${certPath}`);

// Copy rootCA.pem to certs directory so it can be served/downloaded by mobile devices
try {
  const caRootRes = spawnSync(mkcertBin, ['-CAROOT'], { encoding: 'utf8' });
  if (caRootRes.status === 0) {
    const caRoot = caRootRes.stdout.trim();
    const sourceCaPem = path.join(caRoot, 'rootCA.pem');
    if (fs.existsSync(sourceCaPem)) {
      const destCaPem = path.join(certDir, 'rootCA.pem');
      const destCaCrt = path.join(certDir, 'rootCA.crt');
      fs.copyFileSync(sourceCaPem, destCaPem);
      fs.copyFileSync(sourceCaPem, destCaCrt);
      console.log(`✅ Root CA copied to: ${destCaCrt}`);
    }
  }
} catch (e) {
  console.warn('Could not copy rootCA:', e.message);
}

console.log('\n🎉 Local HTTPS certificates are ready!');
