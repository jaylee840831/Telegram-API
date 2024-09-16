const WebSocket = require('ws');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const { prompt } = require('prompts');
const fs = require('fs');

let client;
let stringSession = new StringSession(''); // 可以儲存資訊 ex: 登入資訊，就不用重複登入驗證
const wsServer = new WebSocket.Server({ port: 8086 });

// 創建或打開日誌文件
// const logStream = fs.createWriteStream('./log/app.log', { flags: 'a' });
// const errorStream = fs.createWriteStream('./log/error.log', { flags: 'a' });

// 重定向標準輸出和錯誤輸出
// process.stdout.write = logStream.write.bind(logStream);
// process.stderr.write = errorStream.write.bind(errorStream);

async function authenticate() {
  const credentials = await prompt([
    {
      type: 'number',
      name: 'apiId',
      message: 'Enter your Telegram API ID:',
    },
    {
      type: 'text',
      name: 'apiHash',
      message: 'Enter your Telegram API Hash:',
    },
  ]);

  const apiId = credentials.apiId;
  const apiHash = credentials.apiHash;

  // 創建 Telegram 客戶端
  client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      const response = await prompt({
        type: 'text',
        name: 'phoneNumber',
        message: 'Enter your phone number:',
      });
      return response.phoneNumber;
    },
    phoneCode: async () => {
      const response = await prompt({
        type: 'text',
        name: 'phoneCode',
        message: 'Enter the code you received:',
      });
      return response.phoneCode;
    },
    password: async () => {
      const response = await prompt({
        type: 'text',
        name: 'password',
        message: 'Enter your 2FA password (if applicable):',
      });
      return response.password;
    },
    onError: (err) => console.log(err),
  });

  console.log('Logged in successfully!');
  fs.writeFileSync('session.txt', client.session.save());
}

async function sendMessage (info) {
  try {
    // 发送消息
    await client.sendMessage(info.uuid, { message: info.message });
    console.log(`${info.uuid}'s message sent successfully! : ${info.message}`);
  } catch (error) {
    console.error(`${info.uuid} failed to send message: ${error}`);
  }
}

async function createGroup (group) {
  // const users = [
  //   // await client.getEntity('user1_username'),  // user_id 或 username
  //   // await client.getEntity('user2_username')
  // ];

  const groups = await getAllGroup();
  const uuidExist = groups.find(element => element.title === group?.uuid)
  if (uuidExist) return {}
  
  // 建立群組
  const newChat = await client.invoke(
      new Api.messages.CreateChat({
          users: group?.users,
          title: group?.uuid
      })
  );

  console.log('New group created:', newChat);
  return newChat
}

async function getAllGroup () {
  const groups = [];
  const dialogs = await client.getDialogs();

  if (dialogs) {
    for (const dialog of dialogs) {
      const peer = dialog.dialog.peer;

      // 對話類型：群組、頻道或個人
      if (peer instanceof Api.PeerChat) {
          const chatId = peer.chatId;
          const chat = await client.getEntity(chatId); // 取得群組訊息
          groups.push(chat);
      } else if (peer instanceof Api.PeerChannel) {
          const channelId = peer.channelId;
          const channel = await client.getEntity(channelId); // 取得頻道訊息
          groups.push(channel);
      }
    }
    // console.log('Groups', groups);
  }

  return groups
}

async function getHistoryMessage (uuid) {
  let groupMessages = {};
  const dialogs = await client.getDialogs();
  // console.log('UUID:', uuid);

  if (dialogs) {
    for (const dialog of dialogs) {
      const peer = dialog.dialog.peer;

      // 對話類型：群組、頻道或個人
      if (peer instanceof Api.PeerChat) {
          const chatId = peer.chatId;
          const chat = await client.getEntity(chatId); // 取得群組訊息

          if (chat.title === uuid) {
            const messages = await client.invoke(new Api.messages.GetHistory({
                peer: chat // 群组id
            }));
  
            // 消息按照群組名稱分類
            const result = messages.messages.map(msg => ({
                id: msg.id,
                text: msg.message,
                date: new Date(msg.date * 1000).toLocaleString(
                  'zh-TW', {
                    timeZone: 'Asia/Taipei', // 台灣標準時間
                    year: 'numeric',
                    month: 'long', // 使用 "short" 以顯示月份縮寫，如 "Jan" 或 "Feb"
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    weekday: 'long' // 使用 "short" 以顯示星期幾的縮寫，如 "Mon"
                  }
                )
            }));
  
            groupMessages = {
              title: chat.title,
              messages: result
            }
          }
      } else if (peer instanceof Api.PeerChannel) {
          const channelId = peer.channelId;
          const channel = await client.getEntity(channelId); // 取得頻道訊息

          if (channel.title === uuid) {
            const messages = await client.invoke(new Api.messages.GetHistory({
                peer: channel  // 頻道id
            }));
  
            // 消息按照群組名稱分類
            const result = messages.messages.map(msg => ({
                id: msg.id,
                text: msg.message,
                date: new Date(msg.date * 1000).toLocaleString(
                  'zh-TW', {
                    timeZone: 'Asia/Taipei', // 台灣標準時間
                    year: 'numeric',
                    month: 'long', // 使用 "short" 以顯示月份縮寫，如 "Jan" 或 "Feb"
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    weekday: 'long' // 使用 "short" 以顯示星期幾的縮寫，如 "Mon"
                  }
                )
            }));
  
            groupMessages = {
              title: channel.title,
              messages: result
            }
          }
      }
    }
    groupMessages.messages = groupMessages.messages.sort((a, b) => a.id - b.id);
    console.log('get group messages:', groupMessages);
  }
  
  return groupMessages
}

function getUpdateMessage () {
  // 設置消息監聽器
  client.addEventHandler(
    async (update) => {
      if (update instanceof Api.UpdateNewMessage) {
        const message = update.message;
        const date = new Date(message.date * 1000).toLocaleString(
          'zh-TW', {
            timeZone: 'Asia/Taipei', // 台灣標準時間
            year: 'numeric',
            month: 'long', // 使用 "short" 以顯示月份縮寫，如 "Jan" 或 "Feb"
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            weekday: 'long' // 使用 "short" 以顯示星期幾的縮寫，如 "Mon"
          }
        );
        let chatId = message.peerId;
        let chatName = "Unknown";

        // 檢查 peerId 類型來確定是否是群組
        if (chatId instanceof Api.PeerChat) {
          const chat = await client.getEntity(chatId.chatId);
          chatName = chat.title; // 取得群組名稱
        } else if (chatId instanceof Api.PeerChannel) {
          const channel = await client.getEntity(chatId.channelId);
          chatName = channel.title; // 取得頻道名稱
        } else if (chatId instanceof Api.PeerUser) {
          const user = await client.getEntity(chatId.userId);
          chatName = `${user.firstName} ${user.lastName || ''}`; // 個人聊天名稱
        }

        const result = {
          id: message.id,
          text: message.message,
          date: date
        };
        const content = {
          title: chatName,
          messages: [ result ]
        }
        console.log(`New message in ${chatName}: ${message.message}`);
        console.log(`Sent at: ${date}`);

        wsServer.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(content));
          }
        });
      }
    }
  );
  console.log('Listening for new messages...');
}

async function getClient() {
  if (!client) {
    if (fs.existsSync('session.txt')) stringSession = new StringSession(fs.readFileSync('session.txt', 'utf-8'));
    await authenticate();
    getUpdateMessage();
  }
  return client;
}

module.exports =
{
  sendMessage,
  createGroup,
  getClient,
  getHistoryMessage
};
