import fs from 'fs';

const API_URL = 'https://medicalbookinghub-backend.vercel.app/api';

async function runTest() {
  console.log('--- STARTING PLATFORM AUDIT ---');
  let token = '';
  let patientId = 0;
  
  try {
    // 1. Register Patient
    console.log('[1/5] Registering Patient...');
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Audit',
        lastName: 'Patient',
        email: `audit_${Date.now()}@esaal.com`,
        password: 'password123',
        phone: '123456789'
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(JSON.stringify(regData));
    token = regData.token;
    patientId = regData.user.id;
    console.log('✅ Patient Registered:', regData.user.email);

    // 2. Fetch & Filter Doctors
    console.log('\n[2/5] Fetching Doctors & Testing Filters...');
    const docRes = await fetch(`${API_URL}/doctors?specialty=Anxiety%20%26%20Stress`);
    const doctors = await docRes.json();
    if (!docRes.ok) throw new Error(JSON.stringify(doctors));
    console.log(`✅ Found ${doctors.length} doctors matching the filter.`);
    
    if (doctors.length === 0) {
      console.log('⚠️ No doctors available to book. Skipping booking flow.');
      return;
    }
    const doctorId = doctors[0].id;

    // 3. Book Appointment
    console.log('\n[3/5] Booking Appointment...');
    const bookRes = await fetch(`${API_URL}/appointments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        doctorId,
        slotId: null, // Instant Session
        notes: 'Integration test session'
      })
    });
    const bookData = await bookRes.json();
    if (!bookRes.ok) throw new Error(JSON.stringify(bookData));
    const appointmentId = bookData.id;
    console.log('✅ Appointment Booked ID:', appointmentId);

    // 4. Test Chat & Image Upload Logic
    console.log('\n[4/5] Testing Chat & Image System...');
    const chatRes = await fetch(`${API_URL}/appointments/${appointmentId}/messages`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        content: 'Hello, here is my test image receipt.',
        type: 'image',
        fileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      })
    });
    const chatData = await chatRes.json();
    if (!chatRes.ok) throw new Error(JSON.stringify(chatData));
    console.log('✅ Message Sent! ID:', chatData.id, '| Type:', chatData.type);
    
    // Check Messages Retrieval
    const getChatRes = await fetch(`${API_URL}/appointments/${appointmentId}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getChatData = await getChatRes.json();
    console.log(`✅ Retrieved ${getChatData.length} messages.`);

    // 5. Rate Appointment
    // Note: Can only rate completed appointments, but we will test the endpoint structure.
    console.log('\n[5/5] Testing Rating Logic...');
    const rateRes = await fetch(`${API_URL}/appointments/${appointmentId}/rate`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        rating: 5,
        review: 'Excellent service!'
      })
    });
    const rateData = await rateRes.json();
    // It should throw a 400 'Can only rate completed appointments', which means the endpoint works securely.
    if (rateRes.status === 400 && rateData.error === 'Can only rate completed appointments') {
      console.log('✅ Rating endpoint secured correctly (blocked pending appointment).');
    } else if (!rateRes.ok) {
      throw new Error(JSON.stringify(rateData));
    } else {
      console.log('✅ Rating successful.');
    }

    console.log('\n🏆 ALL INTEGRATION TESTS PASSED!');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

runTest();
