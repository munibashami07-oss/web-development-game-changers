import { useState, useEffect } from 'react';

export function LiveClock() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        <span className="live-clock">
            {pad(time.getUTCHours())}:{pad(time.getUTCMinutes())}:{pad(time.getUTCSeconds())} UTC
        </span>
    );
}