const express = require('express');
const cors = require('cors');
const app = express();
const { getClient } = require('./telegramClient');
const port = 3000;

app.use(cors());
app.use(express.json());

const apiRouter = require('./api/telegramAPI');
app.use('/api', apiRouter);

app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    await getClient();
});
