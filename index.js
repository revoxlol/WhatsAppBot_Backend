const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/chatbot', { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB database');
});

const flowSchema = new mongoose.Schema({ flow: String });
const Flow = mongoose.model('Flow', flowSchema);

const userSchema = new mongoose.Schema({
  id: String,
  date: String,
  time: String,
  username: String,
  phoneNumber: String,
  action: String,
});

const User = mongoose.model('User', userSchema);

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    timeout: 120000
  }
});

client.on('qr', (qr) => {
  console.log('QR Code received, scan it with your phone:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('Authenticated successfully');
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('auth_failure', (msg) => {
  console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out:', reason);
  client.initialize();
});

client.on('message', async (msg) => {
  console.log('Received message:', msg.body);
  const chatId = msg.from;
  const message = msg.body.toLowerCase();
  console.log(`Message from ${chatId}: ${message}`);

  const user = await client.getContactById(chatId);
  const userName = user.pushname || user.number;
  const phoneNumber = user.number;
  console.log(`User details - Name: ${userName}, Phone Number: ${phoneNumber}`);

  if (message === '/consultation') {
    console.log('Handling consultation request');

    // Dynamically generate WhatsApp links for the user's phone number
    const callMeLink = `https://wa.me/${phoneNumber}?text=%2Fcall_me`;
    const writeMeLink = `https://wa.me/${phoneNumber}?text=%2Fwrite_me`;

    client.sendMessage(chatId, `Hello ${userName}. Your request for a consultation has been accepted. How would you prefer to talk, orally or by email?\n${callMeLink}\n${writeMeLink}`);
  } else if (message === '/call_me' || message === '/write_me') {
    console.log('Handling call/write request');
    const action = message === '/call_me' ? 'call' : 'write';
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    const newUser = new User({ id: chatId, date, time, username: userName, phoneNumber, action });
    await newUser.save();
    console.log('New user saved:', newUser);
    client.sendMessage(chatId, 'Ok. The first available manager will contact you immediately. Thank you for your request.');
    // Dynamically generate the notification for the manager
    client.sendMessage(`${phoneNumber}@c.us`, `${userName} (${phoneNumber}) left a request for a consultation (${action}). Date and time of the request: ${date} ${time}. You need to contact them.`);
  }
});

client.initialize();

app.post('/saveFlow', async (req, res) => {
  console.log('Received flow:', req.body.flow);
  const { flow } = req.body;
  const newFlow = new Flow({ flow });
  try {
    await newFlow.save();
    console.log('Flow saved successfully');
    res.send('Flow saved successfully');
  } catch (error) {
    console.error('Error saving flow:', error);
    res.status(500).send('Error saving flow');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
