/**
 * Login script for geleisure.perfectgym.com.au based on HAR analysis.
 *
 * Usage: node gesac.js
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

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

// setup login details, defaults to me :)
const loginAddress = process.env.GESAC_LOGIN ? process.env.GESAC_LOGIN.trim() : "tim@cyberlanes.com.au";
const loginPassword = process.env.GESAC_PASSWORD ? process.env.GESAC_PASSWORD.trim() : "Leeroyx1966";
const credentials = {
	"RememberMe": false,
	"Login": loginAddress,
	"Password": loginPassword
};
console.log('Using credentials for:' + loginAddress);
if (!credentials.Login || !credentials.Password) {
	console.error("⚠️  MISSING CREDENTIALS: Ensure GESAC_LOGIN and GESAC_PASSWORD are set.");
	process.exit(1);
}

// setup details to send an email.
const smtpEmailAddress = 'bobruub@gmail.com'; // This should be the same as credentials.Login or another email you want to receive notifications at.
const emailPassword = 'nrui afwh eerz ocoi'; // This should be a 16-character app password for Gmail, not your regular email password.

// set all the variables to be essentially global within the script, 
// this is to avoid having to pass them around between functions and 
// to keep track of the state of the script.
// super lazy but here we are.
let lastLoginTimestamp = null;
let jwtToken = null; // Store JWT token for authenticated requests
let formattedDate = null; // Store formatted date for class queries
let formattedTime = null; // Store formatted time for class queries
let eventName = null; // Store event name for class queries
let filteredClasses = []; // Store filtered classes for the target event
let mailOptions = null; // Store email options for notifications
let classBookingStatus = null; // Store the booking status of the class
let userUserId = null; // Store the user ID for booking verification
let userClubid = null; // Store the club ID for booking verification

async function login() {
    // if you've already logged in over the last 7 hours no need to do again as the token is valid for 8 hours, this is to avoid unnecessary logins and potential rate limiting.
    // stops issues with too many logins
	if (lastLoginTimestamp) {
		const now = new Date().getTime();
		const last = new Date(lastLoginTimestamp).getTime();
		const twentyFourHours = 7 * 60 * 60 * 1000;

		if (now - last < twentyFourHours) {
			console.log('\tSkipping login: Less than 7 hours have passed since the last successful login.');
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
	const responseClone = response.clone();
	const responseText = await responseClone.text();
    const jsonResponse = JSON.parse(responseText);
    
    // extract user details form the respones
    userUserId = jsonResponse.User.Member.Id;
	userClubid = jsonResponse.User.Member.DefaultClubId;

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
		if (jwtToken) console.log('\tJWT Token:', jwtToken);
	} else {
		console.log('\n⚠️ Login might have failed. No jwt-token header or CpAuthToken cookie found.');
		if (responseBody) {
			console.log('Response Body:', JSON.stringify(responseBody, null, 2));
			console.log('Response Headers:', [...response.headers.entries()]);
		}
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

		classData = JSON.parse(JSON.stringify(filteredClasses, null, 2));

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
		const jsonData = JSON.stringify(data);
		const userId2 = data.UserId;
		if (userId2 === userUserId) {
			returnBookStatus = true;
		} else {
			returnBookStatus = false;
		}

	} catch (error) {
		console.error('Fetch Error:', error.message);
	}
	return returnBookStatus;
}

// Create a transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: smtpEmailAddress, // Your email address
		pass: emailPassword,
	},
});

(async () => {
	for (;;) {
		await login();
		
		const now = new Date();
		const timeZone = 'Australia/Melbourne';
		const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone }).toLowerCase();
		let nowAEDT = new Date(now.toLocaleString('en-US', { timeZone }));

        // loop through days.json and find any entries that match the current day, then check if the time is within 5 minutes of the check time, if it is then we will attempt to book the class.
		for (const entry of schedule) {
        
            console.log(`Checking Class: ${entry.name} on ${entry.weekday} at ${entry.startTime}`);
            // if the entry checkday matches the current day, then we will check if the time is within 5 minutes of the check time, if it is then we will attempt to book the class.
			if (entry.checkday.toLowerCase() === currentDay) {
                await login();
		    
				console.log(`\tChecking Time: ${entry.checkday} at ${entry.checkTime} now ${nowAEDT.toString()}`);
				let [hours, minutes] = entry.startTime.split(':').map(Number);
				const classTime = new Date(nowAEDT);
				classTime.setHours(hours, minutes, 0, 0);
				//        console.log('\tClass time (AEDT):', classTime.toString());

				[hours, minutes] = entry.checkTime.split(':').map(Number);
				const checkTime = new Date(nowAEDT);
				checkTime.setHours(hours, minutes, 0, 0);
		
				// get now plus and minus 5 minutes
				const initialDateStr = checkTime.toString();
				const dateAfter = new Date(initialDateStr);
				dateAfter.setMinutes(dateAfter.getMinutes() + 5);
				const dateBefore = new Date(initialDateStr);
				dateBefore.setMinutes(dateBefore.getMinutes() - 5);

                // if the current time is within 5 minutes of the check time, then we will attempt to book the class.
				if (nowAEDT > dateBefore && nowAEDT < dateAfter) {
					classBookingStatus = "notBooked";
					console.log(`\t\tProcessing Class: ${entry.name} on ${entry.weekday} at ${entry.startTime}`);
					console.log(`\t\tProcessing Time: ${entry.checkday} at ${entry.checkTime}`);
                	const targetDate = new Date(nowAEDT);
					targetDate.setDate(targetDate.getDate() + 2);
					const dateStr = targetDate.toString();

					// 1. Parse the string into a Date object
					const date = new Date(dateStr);
					// based on the server's timezone.
					const year = date.getFullYear();
					const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
					const day = String(date.getDate()).padStart(2, '0');
					formattedDate = `${year}-${month}-${day}`;
					formattedTime = `${year}-${month}-${day}T${entry.startTime}`;
					eventName = entry.name || "Unknown Event";
                    // if it's already book then skip trying to book again, 
                    // this is to avoid unnecessary booking attempts and potential issues with the booking system.    
					if (classBookingStatus === "Booked") {
						break;
					}
					let url = 'https://geleisure.perfectgym.com.au/clientportal2/Classes/ClassCalendar/DailyClasses';
					let payload = {
						clubId: userClubid,
						date: formattedDate, // two days date
						categoryId: null,
						timeTableId: null,
						trainerId: null,
						activityCategoryId: null,
						zoneId: null
					};
					console.log("\t\tChecking class: ", entry.name + " - " + entry.weekday + " " + entry.startTime);
					let responseData = await fetchGymClasses(url, payload);
					let classData = JSON.parse(responseData);
					if (!classData || classData.length === 0) {
						console.log('\t\tNo classes found for this entry.');
						continue;
					}
					let classBookingId = classData[0].classId;
					classBookingStatus = classData[0].status;
					console.log("\t\tclassStatus: ", classBookingStatus);
                    // if the class is bookable then we will attempt to book the class, 
                    // if it's not bookable then we will skip to the next entry, 
                    // this is to avoid unnecessary booking attempts and potential issues with the booking system. 
					if (classBookingStatus === "Bookable") {
						
						let bookingStatus = false;
                        let attempts = 0;

						while (!bookingStatus) { // while we havent yet books, we will keep trying every minute
							
							payload = {
								classId: classBookingId,
								clubId: userClubid
							};
							url = 'https://geleisure.perfectgym.com.au/clientportal2/Classes/ClassCalendar/BookClass';
							bookingStatus = await bookGymClass(url, payload);
							console.log("\t\tbookingStatus: ", bookingStatus);
                            // if the booking was successful then we will send an email notification
                            if (bookingStatus) {
								console.log('\t\tAttempting to send email notification for booking to: ', loginAddress);

								mailOptions = {
									from: '"Gsac Booking" <bobruub@gmail.com>',
									to: loginAddress, // Send to the SMTP email address
									subject: 'Class Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime,
									text: 'Class Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime
								};

								try {
									const info = await transporter.sendMail(mailOptions);
									console.log('\t\tEmail sent successfully to:', loginAddress);
									console.log('\t\tClass Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime);

								} catch (error) {
									console.error('Error sending email:', error);
								}
								break; // Exit the booking loop once successful

							}
                            // pause for a minute before trying again to avoid spamming the booking endpoint and to give it time to update the booking status, 
                            // if we keep trying too fast it may cause issues with the booking system or get us rate limited.
                            await new Promise(r => setTimeout(r, 60000));
                            attempts++;
                            // if we have attempted to book 12 times (about 12 minutes) and still haven't succeeded, 
                            // then we will assume something is wrong and send an email notification about the failure, 
                            // then move on to the next entry, 
                            // this is to avoid getting stuck on one entry and to ensure we are notified of 
                            // potential issues with the booking system.    
                            if (attempts >= 12) {
                                console.log('\t\tMax booking attempts reached. Moving to next entry.');
                                mailOptions = {
									from: '"Gsac Booking" <bobruub@gmail.com>',
									to: loginAddress, // Send to the SMTP email address
									subject: 'Class NOT Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime,
									text: 'Class NOT Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime
								};
								
								try {
									const info = await transporter.sendMail(mailOptions);
									console.log('\t\tEmail sent successfully to:', loginAddress);
									console.log('\t\tClass NOT Booked - ' + eventName + ' - ' + entry.weekday + ' ' + entry.startTime);

								} catch (error) {
									console.error('Error sending email:', error);
								}
                                break;
						
                            }
                        }

					}

				}
			}
		}

		// Small delay between days requests.
		await new Promise(r => setTimeout(r, 60000));
	}
})().catch(console.error);