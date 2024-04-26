import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { CohereClient } from 'cohere-ai';
import sharp from 'sharp';

// Load the environment variables
const stabilityApiKey = "sk-MNN7uTVEkOxauKt0tT2nxwVtWaoFdmADhrnEEWBQXHE6qvHb";
const engineId = 'stable-diffusion-v1-6';
const apiHost = 'https://api.stability.ai';
const cohere = new CohereClient({
  token: "Rdce48UhGe8Tl12zHSbgFdVEbZFDNzrXoiuMIA4e",
});

export default async function imageGenerator(req: Request, res: Response) {
  if (req.method === 'POST') {
    const { prompt } = req.body;

    try {
      // Generate text using Cohere AI
      const cohereResponse = await cohere.chat({
        message: `funny quote of one line only 4-5 words: ${prompt}`,
        maxTokens: 100,
        temperature: 0.7,
      });

      const cohereText = cohereResponse.text || '';
      console.log(cohereText);

      // Generate image using Stability AI
      const response = await fetch(`${apiHost}/v1/generation/${engineId}/text-to-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
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
      });

      if (!response.ok) {
        throw new Error(`Non-200 response: ${await response.text()}`);
      }

      const responseJSON = await response.json() as { artifacts: { base64: string }[] };

      const stabilityImages: Buffer[] = [];
      responseJSON.artifacts.forEach((image) => {
          const buffer = Buffer.from(image.base64, 'base64');
          stabilityImages.push(buffer);
      });

      // Combine the output of Cohere AI with Stability AI images
      const combinedImage = await combineImagesWithText(cohereText, stabilityImages);

      // Send the combined image as the response
      res.setHeader('Content-Type', 'image/png');
      res.status(200).send(combinedImage);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred while generating the image.' });
    }
  } else {
    res.status(405).end(); // Method Not Allowed
  }
}

// Function to combine text from Cohere AI with Stability AI images
async function combineImagesWithText(cohereText: string, stabilityImages: Buffer[]) {
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
      { input: stabilityImages[0], top: cohereTextHeight + additionalGap, left: 0 }, // Place Stability AI image(s) after Cohere AI text
    ])
    .png()
    .toBuffer();

  return combinedImageBuffer;
}

// Function to render text to an image
async function renderTextToImage(text: string) {
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
}
