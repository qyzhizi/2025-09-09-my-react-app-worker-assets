import { useState } from 'react';
import { saveSubmission, getAllSubmissions } from './db';

export default function LocalStoreApp() {
  const [text, setText] = useState('');
  const [list, setList] = useState<
    { id?: number; text: string; time: number }[]
  >([]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    await saveSubmission(text);
    alert(navigator.onLine ? 'Online submission successful' : 'Offline save successful');
    setText('');
  };

  const handleLoad = async () => {
    const data = await getAllSubmissions();
    setList(data);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>React + TS + PWA + IndexedDB</h1>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter content (supports offline)"
        rows={4}
        style={{ width: '100%' }}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={handleSubmit}>Submit</button>
        <button onClick={handleLoad} style={{ marginLeft: 10 }}>
          Load local data
        </button>
      </div>

      <ul>
        {list.map((item) => (
          <li key={item.id}>
            {new Date(item.time).toLocaleString()}：{item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
