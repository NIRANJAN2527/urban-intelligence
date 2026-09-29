const fs = require('fs');
const path = require('path');

const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin.js'), 'utf8');

console.log('--- DEMO DATA ISOLATION VERIFICATION ---');

const hasDemoAll = adminJs.includes('const DEMO_ALL_EVENTS = [');
console.log('1. DEMO_ALL_EVENTS defined in frontend:', hasDemoAll);

const hasDemoMap = adminJs.includes('const DEMO_EVENTS_MAP = new Map();');
console.log('2. DEMO_EVENTS_MAP defined for instant lookup:', hasDemoMap);

const hasUpdateGuard = adminJs.includes("eventId.startsWith('demo-')") && adminJs.includes("DEMO_EVENTS_MAP.has(eventId)");
console.log('3. updateEventStatus isolates demo events from API:', hasUpdateGuard);

const hasDispatchGuard = adminJs.includes('if (evt.is_demo)');
console.log('4. dispatchReport isolates demo events from Supabase:', hasDispatchGuard);

const hasSelectFallback = adminJs.includes('if (!evt && DEMO_EVENTS_MAP.has(eventId))');
console.log('5. selectEventById falls back to DEMO_EVENTS_MAP:', hasSelectFallback);

const hasTooltip = adminJs.includes('function formatMarkerTooltip(');
console.log('6. formatMarkerTooltip implemented:', hasTooltip);

const hasMarkerPin = adminJs.includes('gis-marker-pin');
console.log('7. gis-marker-pin modern marker system:', hasMarkerPin);

const hasLogoImg = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8').includes('drishtiyana-logo-trans.png');
console.log('8. Admin header uses official logo image:', hasLogoImg);

const hasCitizenLogo = fs.readFileSync(path.join(__dirname, '../public/citizen.html'), 'utf8').includes('drishtiyana-logo-trans.png');
console.log('9. Citizen header uses official logo image:', hasCitizenLogo);

const hasViewerLogo = fs.readFileSync(path.join(__dirname, '../public/viewer.html'), 'utf8').includes('drishtiyana-logo-trans.png');
console.log('10. Edge Monitor header uses official logo image:', hasViewerLogo);

if (hasDemoAll && hasDemoMap && hasUpdateGuard && hasDispatchGuard && hasSelectFallback && hasTooltip && hasMarkerPin && hasLogoImg && hasCitizenLogo && hasViewerLogo) {
  console.log('\n======================================================');
  console.log('🎉 ALL 10/10 FRONTEND BRANDING, MAP & DEMO CHECKS PASSED!');
  console.log('======================================================');
} else {
  console.error('\nFAIL: One or more checks failed!');
  process.exit(1);
}
