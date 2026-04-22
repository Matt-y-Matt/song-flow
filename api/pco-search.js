export default async function handler(req, res) {
  return res.status(401).json({ error: 'PCO not configured yet' });
}
