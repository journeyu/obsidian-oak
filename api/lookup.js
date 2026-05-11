// api/lookup.js

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Get the batch ID from the URL e.g. /api/lookup?batchId=OAK-2024-001
  const batchId = req.query.batchId;

  if (!batchId) {
    return res.status(400).json({ error: 'Please provide a batchId in the URL.' });
  }

  // These come from Vercel Environment Variables — never hardcode them here
  const token        = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_COLLECTION_ID;

  if (!token || !collectionId) {
    return res.status(500).json({ error: 'Missing environment variables in Vercel settings.' });
  }

  try {

    // Fetch all items from your Webflow CMS collection
    const response = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept-version': '2.0.0',
        }
      }
    );

    // If Webflow returns an error, show it clearly
    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: `Webflow error ${response.status}`,
        detail: body,
        hint:
          response.status === 401 ? 'API token is wrong. Check WEBFLOW_API_TOKEN in Vercel.' :
          response.status === 403 ? 'Free Webflow plan does not allow API access. Upgrade to Basic.' :
          response.status === 404 ? 'Collection ID is wrong. Check WEBFLOW_COLLECTION_ID in Vercel.' :
          'See detail above.'
      });
    }

    const data = await response.json();
    const items = data.items || [];

    // Search for the item whose batch-id field matches what the user typed
    const match = items.find(item =>
      (item.fieldData['batch-id'] || '').toLowerCase() === batchId.toLowerCase()
    );

    if (!match) {
      return res.status(404).json({
        error: `No batch found for "${batchId}"`,
        available: items.map(i => i.fieldData['batch-id']).filter(Boolean)
      });
    }

    // Return the matched batch data
    return res.status(200).json(match.fieldData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

};
