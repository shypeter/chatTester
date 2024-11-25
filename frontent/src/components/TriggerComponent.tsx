'use client';
import { useState } from 'react';

interface TriggerRes {
    igResult: any;
    fbResult: any;
    lineResult: any;
    error?: string;
}

export default function Trigger() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TriggerRes | null>(null);
    const [type, setType] = useState('A');

    const handleTrigger = async () => {
        setLoading(true);
        try {
            const [fbRes, igRes] = await Promise.all([
                fetch('/api/Trigger?platform=fb&type=' + type),
                fetch('/api/Trigger?platform=ig&type=' + type),
            ]);
            if (!fbRes.ok || !igRes.ok) {
                throw new Error('Failed to trigger the AI');
            }

            const fbResult = await fbRes.json();
            const igResult = await igRes.json();

            const lineRes = await fetch('/api/Trigger?platform=line&type=' + type);
            const lineResult = await lineRes.json();

            setResult({ igResult, fbResult, lineResult });
        } catch (err) {
            setResult({ igResult: null, fbResult: null, lineResult: null, error: err instanceof Error ? err.message : 'An error occurred' });
        } finally {
            setLoading(false);
        }
    };

    const formatJson = (data: any) => {
        return (
            <pre className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                <code className="text-sm">
                    {JSON.stringify(data, null, 2)}
                </code>
            </pre>
        );
    };

    return (
        <div className="space-y-4">
            <div style={{ marginBottom: '20px' }}>
                response_type
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    <option value="A">A</option>
                    <option value="B">B</option>
                </select>
            </div>

            <button
                onClick={handleTrigger}
                disabled={loading}
                style={{
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: loading ? '#ccc' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                }}
            >
                {loading ? '處理中...' : '同時執行 Facebook, Instagram, Line'}
            </button>

            {result && (
                <div className="p-4 rounded-md bg-gray-100">
                    {result.error ? (
                        <p className="text-red-500">{result.error}</p>
                    ) : (
                        <>
                            <h3 className="font-bold mb-2">測試結果：</h3>
                            <div className="space-y-2">
                                <p>fb 結果： {formatJson(result.fbResult)}</p>
                                <p>ig 結果：{formatJson(result.igResult)}</p>
                                <p>line 結果：{formatJson(result.lineResult)}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}