import express from 'express';
import cors from 'cors';
import entriesRouter from './routes/entries.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/entries', entriesRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
