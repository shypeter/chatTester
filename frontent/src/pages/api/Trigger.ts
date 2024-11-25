import type { NextApiRequest, NextApiResponse } from 'next'

const tester = async (platform: string, type: string) => {
    try {
        const response = await fetch(`http://127.0.0.1:5000/tester/${platform}/${type}`);
        if (!response.ok) {
            throw new Error('HTTP error! status: ${response.status}');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(platform + " handler error: ", error);
        throw error;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { platform, type } = req.query;

    if (!platform || !type) {
        return res.status(400).json({ error: 'Missing platform or type' });
    }

    if (typeof platform !== 'string' || !['ig', 'fb'].includes(platform)) {
        return res.status(400).json({ error: 'Invalid platform, need ig or fb' });
    }

    if (typeof type !== 'string' || !['A', 'B'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type, need A or B' });
    }

    try {
        switch (platform) {
            case 'fb':
            case 'ig':
                const result = await tester(platform, type);
                res.status(200).json(result);
                break;
            default:
                res.status(400).json({ error: 'Invalid platform, need ig or fb' });
        }
    } catch (error) {
        console.error("handler error: ", error);
        res.status(500).json({ error: '伺服器錯誤', details: error instanceof Error ? error.message : '未知錯誤' });
    }
}