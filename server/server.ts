import express from 'express';
import cors from 'cors';
import imageGenerator from './imageGenerator';

const app = express();
const port = 3001 || 0; // Choose a different port than 3000

app.use(cors());
app.use(express.json());

// Mount the imageGenerator route
app.post('/api/generate', imageGenerator);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});