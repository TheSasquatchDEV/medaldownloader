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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            // Set a timeout for the request
            timeout: 10000 // 10 seconds
        });
        const html = response.data; // Get the HTML content

        // Load the HTML into cheerio for parsing
        const $ = cheerio.load(html);

        let videoSrc = null;

        // --- Improved Video URL Extraction Logic ---
        // Attempt 1: Look for <meta property="og:video" content="...">
        videoSrc = $('meta[property="og:video"]').attr('content');
        if (videoSrc) {
            console.log('Found videoSrc from og:video meta tag:', videoSrc);
        }

        // Attempt 2: Look for <video> tag with a 'src' attribute
        if (!videoSrc) {
            videoSrc = $('video').attr('src');
            if (videoSrc) {
                console.log('Found videoSrc from video src attribute:', videoSrc);
            }
        }

        // Attempt 3: Look for <source> tag within a <video> tag
        if (!videoSrc) {
            videoSrc = $('video source').attr('src');
            if (videoSrc) {
                console.log('Found videoSrc from video source tag:', videoSrc);
            }
        }

        // Attempt 4: Look for data attributes that might hold the URL (common in JS-heavy sites)
        // This is a more generic approach, looking for attributes that contain common video extensions
        if (!videoSrc) {
            $('[data-src], [data-video-src], [data-url]').each((i, elem) => {
                const dataSrc = $(elem).attr('data-src') || $(elem).attr('data-video-src') || $(elem).attr('data-url');
                if (dataSrc && (dataSrc.includes('.mp4') || dataSrc.includes('.webm') || dataSrc.includes('cdn.medal.tv'))) {
                    videoSrc = dataSrc;
                    console.log('Found videoSrc from data attribute:', videoSrc);
                    return false; // Break the loop
                }
            });
        }

        // Attempt 5: Search for script tags that might contain JSON-LD or embedded video data
        if (!videoSrc) {
            $('script[type="application/ld+json"]').each((i, elem) => {
                try {
                    const jsonData = JSON.parse($(elem).html());
                    if (jsonData && jsonData.contentUrl && (jsonData.contentUrl.includes('.mp4') || jsonData.contentUrl.includes('.webm') || jsonData.contentUrl.includes('cdn.medal.tv'))) {
                        videoSrc = jsonData.contentUrl;
                        console.log('Found videoSrc from JSON-LD:', videoSrc);
                        return false; // Break the loop
                    }
                    if (jsonData && jsonData.video && jsonData.video.contentUrl && (jsonData.video.contentUrl.includes('.mp4') || jsonData.video.contentUrl.includes('.webm') || jsonData.video.contentUrl.includes('cdn.medal.tv'))) {
                        videoSrc = jsonData.video.contentUrl;
                        console.log('Found videoSrc from JSON-LD video object:', videoSrc);
                        return false; // Break the loop
                    }
                } catch (e) {
                    // Not valid JSON or not the structure we're looking for
                }
            });
        }


        // If a video source is found, return it
        if (videoSrc) {
            // Ensure the URL is absolute if it's relative
            if (videoSrc.startsWith('//')) {
                videoSrc = 'https:' + videoSrc;
            } else if (videoSrc.startsWith('/')) {
                // This case is less likely for Medal.tv direct videos, but good practice
                const url = new URL(medalUrl);
                videoSrc = url.origin + videoSrc;
            }
            return res.status(200).json({ directVideoUrl: videoSrc });
        } else {
            // If no video source is found after all attempts
            console.log('No video source found for URL:', medalUrl);
            return res.status(404).json({ error: 'Video Not Found', message: 'Could not find a direct video URL on the provided Medal.tv page. The page structure might have changed or the video is not directly embedded.' });
        }

    } catch (error) {
        console.error('Error fetching or parsing Medal.tv page:', error.message);
        // Provide more specific error messages based on the error type
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Medal.tv response status:', error.response.status);
            console.error('Medal.tv response data:', error.response.data);
            return res.status(error.response.status).json({
                error: 'Failed to fetch Medal.tv page',
                message: `Medal.tv server responded with status: ${error.response.status}. It might be blocking requests or the link is invalid.`,
                details: error.message
            });
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response from Medal.tv server.');
            return res.status(500).json({
                error: 'Network Error',
                message: 'No response received from Medal.tv. Check your internet connection or the URL.',
                details: error.message
            });
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Request setup error:', error.message);
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'An unexpected error occurred while processing your request.',
                details: error.message
            });
        }
    }
};

