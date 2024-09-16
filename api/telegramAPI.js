const { createGroup, sendMessage, getHistoryMessage } = require('../telegramClient');
const express = require('express');
const router = express.Router();

router.get('/history/message', async (req, res) => {
  const { uuid } = req.query;
  res.json(await getHistoryMessage(uuid));
});

router.post('/add/message', async (req, res) => {
  res.json(await sendMessage(req.body));
});

router.post('/createGroup', async (req, res) => {
  res.json(await createGroup(req.body));
});

module.exports = router;
