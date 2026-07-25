const nodemailer = require('nodemailer');

// 1. Create a transporter using Gmail SMTP settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'bobruub@gmail.com',
    pass: 'qttl mugy jbou rwcf' // Your provided App Password
  }
});

// 2. Set up the email data
const mailOptions = {
  from: '"Bob" <bobruub@gmail.com>', 
  to: 'tim@cyberlanes.net', // Change this to the receiver's email
  subject: 'Hello from Node.js!', 
  text: 'This is a test email sent using Nodemailer and Gmail SMTP.', 
  html: '<b>This is a test email sent using Nodemailer and Gmail SMTP.</b>' 
};

// 3. Send the email
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.log('Error occurred:', error.message);
  }
  console.log('Email sent successfully!');
  console.log('Message ID:', info.messageId);
});

