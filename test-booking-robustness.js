// 🧪 SCRIPT TESTARE ROBUSTEȚE PROGRAMĂRI
// Testează edge cases, securitate, și scenarii de eșec

const API_BASE = 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_KEY;

// Helper pentru testare
const testBooking = async (testCase) => {
  console.log(`\n🧪 TESTING: ${testCase.name}`);
  console.log(`📝 Description: ${testCase.description}`);
  
  try {
    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(testCase.payload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ SUCCESS: ${JSON.stringify(result, null, 2)}`);
    } else {
      console.log(`❌ FAILED: ${response.status} - ${JSON.stringify(result, null, 2)}`);
    }
  } catch (error) {
    console.log(`🚨 ERROR: ${error.message}`);
  }
};

// 📋 TEST CASES
const testCases = [
  // 1. XSS Injection Tests
  {
    name: "XSS Injection - Nume",
    description: "Testează injectarea script JavaScript în câmpul nume",
    payload: {
      firstName: '<script>alert("XSS")</script>',
      lastName: 'Test',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },
  {
    name: "XSS Injection - Nume cu HTML",
    description: "Testează injectarea HTML în câmpul nume",
    payload: {
      firstName: '<img src=x onerror=alert("XSS")>',
      lastName: 'Test',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },

  // 2. SQL Injection Tests
  {
    name: "SQL Injection - Nume",
    description: "Testează injectare SQL în câmpul nume",
    payload: {
      firstName: "'; DROP TABLE appointments; --",
      lastName: 'Test',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },

  // 3. Date Invalide Tests
  {
    name: "Telefon Format Invalid",
    description: "Testează format invalid de telefon",
    payload: {
      firstName: 'Ion',
      lastName: 'Popescu',
      phone: 'abc123xyz',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },
  {
    name: "Email Format Invalid",
    description: "Testează format invalid de email",
    payload: {
      firstName: 'Ion',
      lastName: 'Popescu',
      phone: '0712345678',
      email: 'not-an-email',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },

  // 4. Câmpuri Goale Tests
  {
    name: "Câmpuri Obligatorii Goale",
    description: "Testează submit cu câmpuri obligatorii goale",
    payload: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      service: '',
      doctorId: '',
      date: '',
      time: '',
      channel: 'manual'
    }
  },

  // 5. Caractere Speciale Tests
  {
    name: "Emoji în Nume",
    description: "Testează emoji în câmpurile de text",
    payload: {
      firstName: 'Ion 🦷 Popescu',
      lastName: 'Test 👨‍⚕️',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },

  // 6. Date/Time Invalid Tests
  {
    name: "Data Format Invalid",
    description: "Testează format invalid de dată",
    payload: {
      firstName: 'Ion',
      lastName: 'Popescu',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '32/13/2026',
      time: '25:00',
      channel: 'manual'
    }
  },

  // 7. Edge Cases
  {
    name: "String Foarte Lung",
    description: "Testează câmpuri cu valori foarte lungi",
    payload: {
      firstName: 'A'.repeat(1000),
      lastName: 'B'.repeat(1000),
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  },

  // 8. Valid Booking (Control)
  {
    name: "Programare Validă (Control)",
    description: "Testează o programare complet validă",
    payload: {
      firstName: 'Ion',
      lastName: 'Popescu',
      phone: '0712345678',
      email: 'test@example.com',
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  }
];

// 🚀 EXECUȚIE TESTE
console.log('🧪 ÎNCEPERE TESTARE ROBUSTEȚE PROGRAMĂRI...');
console.log(`🎯 Target: ${API_BASE}/api/bookings`);

testCases.forEach((testCase, index) => {
  setTimeout(() => {
    testBooking(testCase);
  }, index * 1000); // 1 secundă între teste
});

// 📊 TESTARE CONCURENȚĂ (Stress Test)
console.log('\n⚡ TESTARE CONCURENȚĂ - 10 requesturi simultane...');
const concurrentPromises = Array(10).fill(null).map((_, i) => 
  testBooking({
    name: `Concurrent Test ${i + 1}`,
    description: `Test concurent ${i + 1}`,
    payload: {
      firstName: `User${i + 1}`,
      lastName: `Test${i + 1}`,
      phone: `071234567${i + 1}`,
      email: `test${i + 1}@example.com`,
      service: 'consultatie',
      doctorId: 'dr1',
      date: '2026-04-16',
      time: '10:00',
      channel: 'manual'
    }
  })
);

Promise.allSettled(concurrentPromises).then(results => {
  console.log('\n📊 REZULTATE CONCURENȚĂ:');
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`✅ Succes: ${successful}, ❌ Eșec: ${failed}`);
});

console.log('\n🏁 Testare completă! Verifică log-ul pentru rezultate.');
