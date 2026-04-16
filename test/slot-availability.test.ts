describe('Slot Availability Flow', () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
  const API_KEY = process.env.VITE_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? '';
  const TEST_PHONE = '0700000099';
  const TEST_DATE = (() => {
    // Next Monday from today, format YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
    return d.toISOString().split('T')[0];
  })();
  const TEST_SLOT = '10:00';
  const TEST_DOCTOR_ID = 'dr1';
  const TEST_DURATION = 30;

  async function apiCall(method: string, path: string, body?: object) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data };
  }

  async function getSlots() {
    return apiCall('GET', 
      `/api/calendar/slots?date=${TEST_DATE}&doctorId=${TEST_DOCTOR_ID}&durationMinutes=${TEST_DURATION}` 
    );
  }

  async function createTestBooking() {
    return apiCall('POST', '/api/bookings', {
      firstName: 'Test',
      lastName: 'Automat',
      phone: TEST_PHONE,
      service: 'Consultatie',   // use first service from /api/config
      doctorId: TEST_DOCTOR_ID,
      date: TEST_DATE,
      time: TEST_SLOT,
      channel: 'manual',
    });
  }

  async function deleteTestBooking() {
    return apiCall('DELETE', '/api/delete-booking', {
      phone: TEST_PHONE,
      date: TEST_DATE,
      time: TEST_SLOT,
    });
  }

  afterEach(async () => {
    // Always attempt cleanup - ignore errors
    await deleteTestBooking().catch(() => {});
  });

  it('TEST 1 - slot is available before any booking', async () => {
    const response = await getSlots();
    expect(response.status).toBe(200);
    expect(response.body.slots).toContain(TEST_SLOT);
    if (!response.body.slots?.includes(TEST_SLOT)) {
      console.log('Full response body for debugging:', JSON.stringify(response.body, null, 2));
    }
  });

  it('TEST 2 - slot is NOT available after manual booking', async () => {
    const createResponse = await createTestBooking();
    if (createResponse.status !== 201) {
      console.log('Create booking failed with body:', JSON.stringify(createResponse.body, null, 2));
    }
    expect(createResponse.status).toBe(201);
    
    const slotsResponse = await getSlots();
    expect(slotsResponse.body.slots).not.toContain(TEST_SLOT);
  });

  it('TEST 3 - slot is available again after hard delete - CRITICAL', async () => {
    const createResponse = await createTestBooking();
    expect(createResponse.status).toBe(201);
    
    const deleteResponse = await deleteTestBooking();
    expect(deleteResponse.status).toBe(200);
    
    // Wait 300ms for any potential async operations
    await new Promise(r => setTimeout(r, 300));
    
    const slotsResponse = await getSlots();
    if (!slotsResponse.body.slots?.includes(TEST_SLOT)) {
      console.log('GHOST RECORD SUSPECTED - slot still blocked after delete');
      console.log('Full slots response:', JSON.stringify(slotsResponse.body, null, 2));
      
      // Also check appointments list to help diagnose
      const appointmentsResponse = await apiCall('GET', 
        `/api/calendar/appointments?date=${TEST_DATE}&doctorId=${TEST_DOCTOR_ID}`
      );
      console.log('Appointments list:', JSON.stringify(appointmentsResponse.body, null, 2));
    }
    expect(slotsResponse.body.slots).toContain(TEST_SLOT);
  });

  it('TEST 4 - delete with wrong payload returns 400', async () => {
    const response = await apiCall('DELETE', '/api/delete-booking', { id: 'fake-id-123' });
    expect(response.status).toBe(400);
  });

  it('TEST 5 - double delete does not crash server', async () => {
    await createTestBooking();
    
    const firstDelete = await deleteTestBooking();
    expect(firstDelete.status).toBe(200);
    
    const secondDelete = await deleteTestBooking();
    expect(secondDelete.status).not.toBe(500);
  });

  it('TEST 6 - booking same slot twice returns conflict error', async () => {
    const firstBooking = await createTestBooking();
    expect(firstBooking.status).toBe(201);
    
    const secondBooking = await createTestBooking();
    expect(secondBooking.status).toBe(400);
    expect(secondBooking.body.error).toBeTruthy();
    
    // Slot should still be taken
    const slotsResponse = await getSlots();
    expect(slotsResponse.body.slots).not.toContain(TEST_SLOT);
  });

  it('TEST 7 - WhatsApp flow sees correct slots', async () => {
    // This simulates what the WebBot flow does
    await createTestBooking();
    
    const slotsAfterBooking = await getSlots();
    expect(slotsAfterBooking.body.slots).not.toContain(TEST_SLOT);
    
    await deleteTestBooking();
    
    const slotsAfterDelete = await getSlots();
    expect(slotsAfterDelete.body.slots).toContain(TEST_SLOT);
  });
});
