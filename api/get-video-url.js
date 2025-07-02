// api/get-video-url.js
// This file defines a Vercel serverless function to fetch direct video URLs from Medal.tv share links.

const axios = require('axios'); // Used for making HTTP requests to Medal.tv
const cheerio = require('cheerio'); // Used for parsing HTML and extracting the video URL

module.exports = async (req, res) => {
    // Set CORS headers to allow requests from any origin (for development/demo purposes).
    // In a production environment, you might want to restrict this to your specific frontend origin.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests for CORS
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Ensure the request method is POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are accepted.' });
    }

    const { medalUrl } = req.body; // Extract the Medal.tv share URL from the request body

    // Validate the incoming URL
    if (!medalUrl || !medalUrl.startsWith('https://medal.tv/')) {
        return res.status(400).json({ error: 'Invalid URL', message: 'Please provide a valid Medal.tv share URL.' });
    }

    try {
        // Fetch the HTML content of the Medal.tv page
        const response = await axios.get(medalUrl, {
            headers: {
                // Mimic a browser user-agent to avoid potential blocking by Medal.tv
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data; // Get the HTML content

        // Load the HTML into cheerio for parsing
        const $ = cheerio.load(html);

        // Try to find the video source. Medal.tv usually has a <video> tag with a 'src' attribute.
        // We look for the <video> tag and then its <source> children, or directly the video src.
        let videoSrc = null;

        // Attempt 1: Find a <video> tag with a direct 'src' attribute
        videoSrc = $('video').attr('src');

        // Attempt 2: If no direct src on video, look for <source> tags within video
        if (!videoSrc) {
            videoSrc = $('video source').attr('src');
        }

        // Attempt 3: Look for a meta tag that might contain the video URL (e.g., og:video)
        if (!videoSrc) {
            videoSrc = $('meta[property="og:video"]').attr('content');
        }

        // Attempt 4: Look for a specific data attribute often used by Medal.tv for video URLs
        // This is a more specific heuristic and might change over time.
        if (!videoSrc) {
            // This selector is an example; actual Medal.tv structure might vary.
            // You might need to inspect a Medal.tv page to find the exact element/attribute.
            videoSrc = $('div[data-vjs-player] video').attr('src');
        }

        // If a video source is found, return it
        if (videoSrc) {
            return res.status(200).json({ directVideoUrl: videoSrc });
        } else {
            // If no video source is found after all attempts
            return res.status(404).json({ error: 'Video Not Found', message: 'Could not find a direct video URL on the provided Medal.tv page. The page structure might have changed.' });
        }

    } catch (error) {
        console.error('Error fetching or parsing Medal.tv page:', error.message);
        // Provide more specific error messages based on the error type
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            return res.status(error.response.status).json({
                error: 'Failed to fetch Medal.tv page',
                message: `Medal.tv server responded with status: ${error.response.status}. It might be blocking requests or the link is invalid.`,
                details: error.message
            });
        } else if (error.request) {
            // The request was made but no response was received
            return res.status(500).json({
                error: 'Network Error',
                message: 'No response received from Medal.tv. Check your internet connection or the URL.',
                details: error.message
            });
        } else {
            // Something happened in setting up the request that triggered an Error
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'An unexpected error occurred while processing your request.',
                details: error.message
            });
        }
    }
};
