import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { CohereClient } from "cohere-ai";
import sharp from "sharp";
import express from "express"; // Import Express

dotenv.config();

// Load the environment variables
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const stabilityApiKey = process.env.STABILITY_API_KEY;
const engineId = "stable-diffusion-v1-6";
const apiHost = "https://api.stability.ai";
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Initialize the Telegram Bot
const bot = new TelegramBot(botToken, { polling: true });

// Initialize Express
const app = express();
const port = process.env.PORT || 3000; // Use PORT environment variable or default to 3000

// Define middleware to parse JSON bodies
app.use(express.json());

// Define route for handling '/img' command
app.post("/img", async (req, res) => {
  const { prompt, chatId } = req.body;
  const processingMessage = await bot.sendMessage(
    chatId,
    "Generating image, please wait..."
  );

  try {
    // Generate text using Cohere AI
    const cohereResponse = await cohere.chat({
      message: `funny quote of one line only 4-5 words: ${prompt}`,
      max_tokens: 100,
      temperature: 0.7,
    });

    const cohereText = cohereResponse.text || "";

    // Generate image using Stability AI
    const response = await fetch(
      `${apiHost}/v1/generation/${engineId}/text-to-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${stabilityApiKey}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          cfg_scale: 8,
          height: 1024,
          width: 1024,
          steps: 50,
          samples: 1,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Non-200 response: ${await response.text()}`);
    }

    const responseJSON = await response.json();

    const stabilityImages = [];
    responseJSON.artifacts.forEach((image, index) => {
      const buffer = Buffer.from(image.base64, "base64");
      stabilityImages.push(buffer);
    });

    // Combine the output of Cohere AI with Stability AI images
    const combinedImage = await combineImagesWithText(cohereText, stabilityImages);

    // Send the combined image to the chat
    bot.sendPhoto(chatId, combinedImage).then(() => {
      bot.deleteMessage(chatId, processingMessage.message_id);
    });
  } catch (error) {
    console.error("Error:", error);
    bot.editMessageText(
      "Sorry, an error occurred while generating the image.",
      {
        chat_id: chatId,
        message_id: processingMessage.message_id,
      }
    );
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Function to combine text from Cohere AI with Stability AI images
async function combineImagesWithText(cohereText, stabilityImages) {
  // Calculate the height of Cohere AI text
  const cohereTextHeight = cohereText.split('\n').length * 24; // Assuming font-size: 24
  const additionalGap = 50;
  
  // Create a white background image
  const whiteBackground = sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Render Cohere AI text onto the upper part of the background
  const cohereImage = await renderTextToImage(cohereText);
  
  // Combine Cohere AI text image with Stability AI images
  const combinedImageBuffer = await whiteBackground
    .composite([
      { input: cohereImage, top: 0, left: 0 }, // Place Cohere AI text at the top-left corner
      { input: stabilityImages[0], top: cohereTextHeight + additionalGap, left: 0,  }, // Place Stability AI image(s) after Cohere AI text
    ])
    .png()
    .toBuffer();

  return combinedImageBuffer;
}

// Function to render text to an image
async function renderTextToImage(text) {
  const textImage = sharp({
    create: {
      width: 1024,
      height: 512, // Half the height for the Cohere AI text
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Add Cohere AI text to the image
  return textImage
    .composite([
      {
        input: Buffer.from(`<svg width="1024" height="512" xmlns="http://www.w3.org/2000/svg"><text x="10" y="30" font-family="Arial" font-size="24" fill="black">${text}</text></svg>`),
        gravity: 'northwest', // Position the text at the top-left corner
      },
    ])
    .png()
    .toBuffer();
};

// Handler for '/start' command - sends a welcome message
bot.onText(/\/start/, (msg) => {
  const welcomeMessage = `
🚀 *Welcome to the Extraordinary MemeBot Universe!* 🚀

Embark on a journey with AI at your side, ready to explore, create, and solve mysteries:

🔍 *Inquiry & Intellect*
- \`/img [your query]\` - Unearth deep insights and real-time web wisdom.

Adventure awaits with every command! Let’s make each day more interesting. Ready to explore?

*Your journey begins now...* 🌌

`;

  bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: "Markdown" });
});
