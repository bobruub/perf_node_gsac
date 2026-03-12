/**
* Login script for geleisure.perfectgym.com.au based on HAR analysis.
*
 * Usage: node gesac.js
*/

const fs = require('fs');
const path = require('path');

// Fix for UNABLE_TO_GET_ISSUER_CERT_LOCALLY
// ⚠️ WARNING: Disables SSL verification. Use only for debugging.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!globalThis.fetch) {
  console.error("❌ Native fetch API not found. Please use Node.js 18+ or a polyfill.");
  process.exit(1);
}

const LOGIN_URL = 'https://geleisure.perfectgym.com.au/clientportal2/Auth/Login';

// Load schedule from days.json
let schedule = [];
try {
  const daysPath = path.join(__dirname, 'days.json');
  const daysContent = fs.readFileSync(daysPath, 'utf8');
  schedule = JSON.parse(daysContent);
  console.log('Loaded schedule:', schedule);
} catch (err) {
  console.error('Error reading days.json:', err.message);
}

// Credentials extracted from the HAR file request body
const credentials = {
  "RememberMe": false,
  "Login": process.env.GESAC_LOGIN ? process.env.GESAC_LOGIN.trim() : "tim@cyberlanes.com.au",
  "Password": process.env.GESAC_PASSWORD ? process.env.GESAC_PASSWORD.trim() : "Leeroyx1966"
};
console.log('Using credentials:', { ...credentials, Password: credentials.Password ? '******' : undefined });

if (!credentials.Login || !credentials.Password) {
  console.error("⚠️  MISSING CREDENTIALS: Ensure GESAC_LOGIN and GESAC_PASSWORD are set.");
  process.exit(1);
}

let lastLoginTimestamp = null;
let jwtToken = null; // Store JWT token for authenticated requests
let formattedDate = null; // Store formatted date for class queries
let formattedTime = null; // Store formatted time for class queries
let eventName = null; // Store event name for class queries
let classId = null; // Store class ID for booking
let filteredClasses = []; // Store filtered classes for the target event

async function login() {
    if (lastLoginTimestamp) {
      const now = new Date().getTime();
      const last = new Date(lastLoginTimestamp).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (now - last < twentyFourHours) {
        console.log('Skipping login: Less than 24 hours have passed since the last successful login.');
        return;
      }
    }

    console.log(`Attempting login to: ${LOGIN_URL}`);

    const response = await fetch(LOGIN_URL, {
      method: 'POST',
      redirect: 'manual', // Handle redirects manually to capture headers from 302 responses
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Hash': '#/Login',
        'CP-LANG': 'en',
        'CP-MODE': 'desktop',
        'Origin': 'https://geleisure.perfectgym.com.au',
        'Referer': 'https://geleisure.perfectgym.com.au/clientportal2/'
      },
      body: JSON.stringify(credentials)
    });

    console.log('Response Status Code:', response.status);

    if (response.status >= 400) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}\nServer Response: ${errorBody}`);
    }

    // The server returns the auth token in a custom header 'jwt-token'
    // and also in the 'set-cookie' header as 'CpAuthToken'.
    jwtToken = response.headers.get('jwt-token');
    // Use getSetCookie() in Node 20 to ensure all cookies are captured as an array
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get('set-cookie');

    let hasAuthCookie = false;
    if (Array.isArray(cookies)) {
      hasAuthCookie = cookies.some(c => c.includes('CpAuthToken'));
    } else if (typeof cookies === 'string') {
      hasAuthCookie = cookies.includes('CpAuthToken');
    }

    let responseBody;
    if (response.status !== 302) {
      try {
        responseBody = await response.json();
      } catch (e) {
        console.warn('⚠️ Could not parse response body as JSON (likely HTML or empty).');
      }
    }

    if (jwtToken || hasAuthCookie) {
        console.log('\n✅ Login Successful!');
        const loginTimestamp = new Date().toISOString();
        lastLoginTimestamp = loginTimestamp;
        console.log('Timestamp:', loginTimestamp);
        if (jwtToken) console.log('JWT Token:', jwtToken);
        if (hasAuthCookie) console.log('Auth Cookie detected (CpAuthToken).');
    } else {
        console.log('\n⚠️ Login might have failed. No jwt-token header or CpAuthToken cookie found.');
        if (responseBody){
            console.log('Response Body:', JSON.stringify(responseBody, null, 2));
            console.log('Response Headers:', [...response.headers.entries()]);
        }
    }

    if (cookies) {
        console.log('\nCookies received:', cookies);
    }
}

async function fetchGymClasses(url, payload) {
  let jsonClassid = null;
    let classData = null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        // Adding the Bearer Token here:
        'Authorization': `Bearer ${jwtToken}`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // 2. Expand/Flatten the nested Classes array
    const expandedClasses = data.CalendarData.flatMap(hourBlock =>
          hourBlock.Classes.map(c => ({
            classId: c.Id,
            status: c.Status,
            title: c.Name,
            instructor: c.TrainerName,
            start: c.StartTime,
            end: c.EndTime,
            slotsAvailable: c.AvailableSlots,
            isBooked: c.IsBooked,
            bookingStatus: c.BookingStatus
          }))
        );

    const startDate = payload.date;
    const targetTitle = eventName; // Replace with the actual class title you're looking for

    // Filter classes for the target date and title
    filteredClasses = expandedClasses.filter(c =>
      c.start === formattedTime && c.title === targetTitle
    );

    console.log("Match Found:");
    console.log(JSON.stringify(filteredClasses, null, 2));
    classData = JSON.parse(JSON.stringify(filteredClasses, null, 2));
    console.log(classData);

  } catch (error) {
    console.error('Fetch Error:', error.message);
  }

  return JSON.stringify(classData);
}

async function bookGymClass(url, payload) {
  let returnBookStatus = null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${jwtToken}`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("booking Data: ", data);
    const jsonData = JSON.stringify(data);
    console.log("booking Data2: ", jsonData);
    const userId = jsonData.UserId;
    const userId2 = data.UserId;
    console.log("booking Data: ", data);
    console.log("userId: ", userId);
    console.log("userId2: ", userId2);
    if (userId2 === 145368){
        returnBookStatus = true;
    } else {
        returnBookStatus = false;
    }

  } catch (error) {
    console.error('Fetch Error:', error.message);
  }
    console.log("ret book status:",returnBookStatus )
  return returnBookStatus;
}

(async () => {
  for (let i = 1; i <= 10000; i++) {
    //await login();
    jwtToken = 'eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJNYXN0ZXJDb21wYW55IjoiZ2VsZWlzdXJlIiwiQXV0aGVudGljYXRpb25UeXBlIjoiUGFzc3dvcmQiLCJVc2VySWQiOiIxNDUzNjgiLCJleHAiOjE3NzMwNjc4MjgsImlzcyI6InBlcmZlY3RneW0uY29tIiwiYXVkIjoicGVyZmVjdGd5bS5jb20ifQ.QjLnE4It8SkL-CWcDi44jS3D_gFLPBkB6jmTVl35atg';

    console.log('Processing schedule:');
    const now = new Date();
    const timeZone = 'Australia/Melbourne';
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone }).toLowerCase();
    const nowAEDT = new Date(now.toLocaleString('en-US', { timeZone }));

    console.log('Current day:', currentDay);
    console.log('Current time (AEDT):', nowAEDT.toString());

    for (const entry of schedule) {
      console.log(` - Checking entry: ${entry.weekday} at ${entry.startTime}`);
      console.log(` - Checking entry: ${entry.checkday} at ${entry.checkTime}`);
      if (entry.checkday.toLowerCase() === currentDay) {
        let [hours, minutes] = entry.startTime.split(':').map(Number);
        const classTime = new Date(nowAEDT);
        classTime.setHours(hours, minutes, 0, 0);
        console.log('\nClass time (AEDT):', classTime.toString());

        [hours, minutes] = entry.checkTime.split(':').map(Number);
        const checkTime = new Date(nowAEDT);
        checkTime.setHours(hours, minutes, 0, 0);
        console.log('\nCheck time (AEDT):', checkTime.toString());

        // get now plus 15 minutes
        const initialDateStr = checkTime.toString();
        const dateAfter = new Date(initialDateStr);
        dateAfter.setMinutes(dateAfter.getMinutes() + 15);
        const dateBefore = new Date(initialDateStr);
        dateBefore.setMinutes(dateBefore.getMinutes() - 15);
        console.log('Check time (AEDT):', checkTime.toString());
        //console.log('         Now (AEDT):', nowAEDT.toString());
        console.log(".    15 minutes before:", dateBefore.toString());
        console.log(".    15 minutes after:", dateAfter.toString());
        console.log('\n');

        if (checkTime > dateBefore && checkTime < dateAfter) {
          console.log(` - Checking ${entry.weekday} at ${entry.startTime}`);
          // now get eh classes for two days in advance to ensure we have the latest data
          const targetDate = new Date(nowAEDT);
          targetDate.setDate(targetDate.getDate() + 2);
          const targetDay = targetDate.toLocaleDateString('en-US', { weekday: 'long', timeZone }).toLowerCase();
          console.log(` - Target day for class data: ${targetDay} (${targetDate.toString()})`);
// call daily classes for that day to ensure we have the latest data

          // The input date string
          const dateStr = targetDate.toString();

          // 1. Parse the string into a Date object
          const date = new Date(dateStr);
          // based on the server's timezone.
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
          const day = String(date.getDate()).padStart(2, '0');

          formattedDate = `${year}-${month}-${day}`;
          formattedTime = `${year}-${month}-${day}T${entry.startTime}`;

          console.log(` - Target Date for class: formattedDate = ${formattedDate}`);
          console.log(` - Target Date for class: formattedTime = ${formattedTime}`);
          eventName = entry.name || "Unknown Event";
          let url = 'https://geleisure.perfectgym.com.au/clientportal2/Classes/ClassCalendar/DailyClasses';
          let payload = {
              clubId: 1,
              date: formattedDate, // two days date
              categoryId: null,
              timeTableId: null,
              trainerId: null,
              activityCategoryId: null,
              zoneId: null
            };
            let responseData = await fetchGymClasses(url, payload);
            let classData = JSON.parse(responseData);
            let classBookingId = classData[0].classId;
            let classBookingStatus = classData[0].status;
            console.log("classId: ", classBookingId);
            console.log("classStatus: ", classBookingStatus);
            if (classBookingStatus === "Bookable"){
                // book class
                console.log("book class: ", classBookingId, " - Status: ", classBookingStatus  )
                let bookingStatus = false;
                console.log("bookingStatus: ", bookingStatus)
                while (!bookingStatus){ // while we havent yet books, we will keep trying every minute
                    //await new Promise(r => setTimeout(r, 60000));
                    await new Promise(r => setTimeout(r, 5000));
                    payload = {
                        classId:classBookingId,
                        clubId:1
                    };
                    console.log("payload: ", payload);
                    url = 'https://geleisure.perfectgym.com.au/clientportal2/Classes/ClassCalendar/BookClass';
                    bookingStatus = await bookGymClass(url, payload);                    
                    console.log("bookingStatus: ", bookingStatus);
                                process.exit(0); // Exit after processing the relevant entry

                }

            }
            //console.log(` - Class ID for booking: ${classData[0].classId}`);
            //console.log(` - Class Status for booking: ${classData[0].status}`);
       
            process.exit(0); // Exit after processing the relevant entry

        }
      }
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 10000));
  }
})().catch(console.error);