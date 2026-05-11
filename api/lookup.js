// api/lookup.js
// ─────────────────────────────────────────────────────────
// This is a Vercel Serverless Function.
// It runs on the SERVER — the browser never sees the token.
//
// The browser calls:  GET /api/lookup?batchId=OAK-2024-001
// This function calls: Webflow API (with secret token)
// Then returns the batch data back to the browser.
// ─────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Allow the browser to call this function
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Get the batchId from the URL: /api/lookup?batchId=OAK-2024-001
  const { batchId } = req.query;

  if (!batchId) {
    return res.status(400).json({ error: 'Missing batchId parameter' });
  }

  // ✅ Token and Collection ID come from Vercel Environment Variables
  // They are NEVER visible in the browser or in your GitHub code
  const token          = process.env.WEBFLOW_API_TOKEN;
  const batchesColId   = process.env.WEBFLOW_COLLECTION_ID;
  const artisansColId  = process.env.WEBFLOW_ARTISANS_COLLECTION_ID; // optional

  if (!token || !collectionId) {
    return res.status(500).json({ error: 'Server is missing environment variables. Check Vercel settings.' });
  }

  try {
    // Step 1: Fetch all batches from Webflow CMS
    const batchResponse = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept-version': '2.0.0',
        }
      }
    );

    if (!batchResponse.ok) {
      const errText = await batchResponse.text();
      return res.status(batchResponse.status).json({ error: `Webflow error: ${errText}` });
    }

    const batchData = await batchResponse.json();

    // Step 2: Find the batch that matches the entered Batch ID
    // Searches by 'batch-id' field (not 'name') — case-insensitive
    const match = batchData.items?.find(item =>
      item.fieldData['batch-id']?.toLowerCase() === batchId.toLowerCase()
    );

    if (!match) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Step 3: If the batch has an artisan linked, fetch artisan data too
    let artisanData = null;
    const artisanRef = match.fieldData['artisan']; // the Reference field value (an item ID)

    if (artisanRef) {
      // Artisan reference is a Webflow item ID — fetch it directly
      const artisanResponse = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/${artisanRef}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '2.0.0',
          }
        }
      );

      if (artisanResponse.ok) {
        const artisanJson = await artisanResponse.json();
        artisanData = artisanJson.fieldData || null;
      }
    }

    // Step 4: Return batch data + artisan data to the browser
    return res.status(200).json({
      ...match.fieldData,
      artisan: artisanData,
    });

  } catch (err) {
    console.error('Lookup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
