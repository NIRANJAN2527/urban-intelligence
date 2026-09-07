const { io } = require('socket.io-client');

async function testSignaling() {
  console.log('[TEST] Starting DRISHTIYANA Signaling Protocol Verification...');

  const URL = 'http://localhost:3000';
  const ROOM_ID = 'BUS-101';

  let phoneJoined = false;
  let laptopJoined = false;
  let offerReceived = false;
  let answerReceived = false;
  let candidateReceived = false;
  let cameraStatusReceived = false;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Signaling test timed out after 5s'));
    }, 5000);

    // 1. Laptop Viewer connects first
    const laptopSocket = io(URL);
    // 2. Phone Sender connects
    const phoneSocket = io(URL);

    // Setup all event listeners before action
    laptopSocket.on('camera-status', ({ status }) => {
      console.log(`✅ Laptop received camera-status: ${status}`);
      if (status === 'LIVE') cameraStatusReceived = true;
    });

    laptopSocket.on('offer', ({ sdp }) => {
      console.log('✅ Laptop received WebRTC offer:', sdp.type);
      offerReceived = true;
      // Laptop replies with answer and ICE candidate
      laptopSocket.emit('answer', { roomId: ROOM_ID, sdp: { type: 'answer', sdp: 'mock-laptop-answer-sdp' } });
      laptopSocket.emit('ice-candidate', { roomId: ROOM_ID, candidate: { candidate: 'candidate:1 1 UDP ...' } });
    });

    phoneSocket.on('answer', ({ sdp }) => {
      console.log('✅ Phone received WebRTC answer:', sdp.type);
      answerReceived = true;
    });

    phoneSocket.on('ice-candidate', ({ candidate }) => {
      console.log('✅ Phone received ICE candidate from laptop');
      candidateReceived = true;
      clearTimeout(timeout);
      laptopSocket.disconnect();
      phoneSocket.disconnect();
      resolve();
    });

    // Connection lifecycle
    laptopSocket.on('connect', () => {
      console.log('✅ Laptop socket connected:', laptopSocket.id);
      laptopSocket.emit('join-room', { roomId: ROOM_ID, role: 'viewer' });
      laptopJoined = true;
    });

    phoneSocket.on('connect', () => {
      console.log('✅ Phone socket connected:', phoneSocket.id);
      phoneSocket.emit('join-room', { roomId: ROOM_ID, role: 'sender' });
      phoneJoined = true;

      // Simulate phone user clicking "START CAMERA"
      setTimeout(() => {
        console.log('📹 Simulating Phone: "START CAMERA" pressed...');
        phoneSocket.emit('camera-status', { roomId: ROOM_ID, status: 'LIVE' });
        phoneSocket.emit('offer', { roomId: ROOM_ID, sdp: { type: 'offer', sdp: 'mock-phone-offer-sdp' } });
      }, 500);
    });
  });

  console.log('\n========================================');
  console.log('       SIGNALING TEST RESULTS           ');
  console.log('========================================');
  console.log('Phone Joined Room:       ', phoneJoined ? 'PASS' : 'FAIL');
  console.log('Laptop Joined Room:      ', laptopJoined ? 'PASS' : 'FAIL');
  console.log('Camera Status Relayed:   ', cameraStatusReceived ? 'PASS' : 'FAIL');
  console.log('WebRTC Offer Relayed:    ', offerReceived ? 'PASS' : 'FAIL');
  console.log('WebRTC Answer Relayed:   ', answerReceived ? 'PASS' : 'FAIL');
  console.log('ICE Candidate Relayed:   ', candidateReceived ? 'PASS' : 'FAIL');
  console.log('========================================\n');

  if (phoneJoined && laptopJoined && cameraStatusReceived && offerReceived && answerReceived && candidateReceived) {
    console.log('🎉 ALL SIGNALING CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('❌ Some signaling checks failed.');
    process.exit(1);
  }
}

testSignaling().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
