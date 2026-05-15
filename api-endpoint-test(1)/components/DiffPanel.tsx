import React, { useState } from "react";

interface DiffPanelProps {
  defaultUrlA?: string;
  defaultUrlB?: string;
  defaultHeaders?: { key: string; value: string }[];
}

interface ApiResponse {
  status: number;
  time: number;
  size: string;
  body: any;
}

const DiffPanel: React.FC<DiffPanelProps> = ({
  defaultUrlA = "",
  defaultUrlB = "",
  defaultHeaders = [],
}) => {
  const [urlA, setUrlA] = useState(defaultUrlA);
  const [urlB, setUrlB] = useState(defaultUrlB);
  const [headers, setHeaders] = useState(defaultHeaders);
  const [responseA, setResponseA] = useState<ApiResponse | null>(null);
  const [responseB, setResponseB] = useState<ApiResponse | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  const runBothRequests = async () => {
    const fetchOptions = {
      method: "GET",
      headers: headers.reduce((acc, { key, value }) => {
        if (key && value) acc[key] = value;
        return acc;
      }, {} as Record<string, string>),
    };

    const startTimeA = performance.now();
    const startTimeB = performance.now();

    try {
      const [resA, resB] = await Promise.all([
        fetch(urlA, fetchOptions),
        fetch(urlB, fetchOptions),
      ]);

      const timeA = performance.now() - startTimeA;
      const timeB = performance.now() - startTimeB;

      const bodyA = await resA.json();
      const bodyB = await resB.json();

      setResponseA({
        status: resA.status,
        time: timeA,
        size: `${JSON.stringify(bodyA).length} B`,
        body: bodyA,
      });

      setResponseB({
        status: resB.status,
        time: timeB,
        size: `${JSON.stringify(bodyB).length} B`,
        body: bodyB,
      });

      setDiff(generateDiff(bodyA, bodyB));
    } catch (error) {
      console.error("Error running requests:", error);
    }
  };

  const generateDiff = (objA: any, objB: any): string => {
    const diff: string[] = [];

    const compare = (a: any, b: any, path: string[] = []) => {
      if (typeof a === "object" && typeof b === "object" && a && b) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        keys.forEach((key) => {
          compare(a[key], b[key], [...path, key]);
        });
      } else if (a !== b) {
        if (a === undefined) {
          diff.push(`+ ${path.join(".")}: ${JSON.stringify(b)}`);
        } else if (b === undefined) {
          diff.push(`- ${path.join(".")}: ${JSON.stringify(a)}`);
        } else {
          diff.push(`~ ${path.join(".")}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
        }
      } else {
        diff.push(`  ${path.join(".")}: ${JSON.stringify(a)}`);
      }
    };

    compare(objA, objB);
    return diff.join("\n");
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium">Env A URL</label>
          <input
            type="text"
            value={urlA}
            onChange={(e) => setUrlA(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium">Env B URL</label>
          <input
            type="text"
            value={urlB}
            onChange={(e) => setUrlB(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Headers</label>
        <div className="flex flex-col gap-2">
          {headers.map((header, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={header.key}
                onChange={(e) => {
                  const newHeaders = [...headers];
                  newHeaders[index].key = e.target.value;
                  setHeaders(newHeaders);
                }}
                placeholder="Key"
                className="flex-1 p-2 border rounded"
              />
              <input
                type="text"
                value={header.value}
                onChange={(e) => {
                  const newHeaders = [...headers];
                  newHeaders[index].value = e.target.value;
                  setHeaders(newHeaders);
                }}
                placeholder="Value"
                className="flex-1 p-2 border rounded"
              />
            </div>
          ))}
          <button
            onClick={() => setHeaders([...headers, { key: "", value: "" }])}
            className="p-2 text-sm text-white bg-blue-500 rounded"
          >
            Add Header
          </button>
        </div>
      </div>

      <button
        onClick={runBothRequests}
        className="p-2 text-white bg-green-500 rounded"
      >
        Run Both
      </button>

      <div className="flex gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-medium">Env A</h3>
          {responseA && (
            <div className="p-2 border rounded">
              <p>Status: {responseA.status}</p>
              <p>Time: {responseA.time.toFixed(2)}ms</p>
              <p>Size: {responseA.size}</p>
              <pre className="overflow-auto text-sm bg-gray-100 p-2 rounded">
                {JSON.stringify(responseA.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium">Env B</h3>
          {responseB && (
            <div className="p-2 border rounded">
              <p>Status: {responseB.status}</p>
              <p>Time: {responseB.time.toFixed(2)}ms</p>
              <p>Size: {responseB.size}</p>
              <pre className="overflow-auto text-sm bg-gray-100 p-2 rounded">
                {JSON.stringify(responseB.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {diff && (
        <div>
          <h3 className="text-lg font-medium">Diff</h3>
          <pre className="overflow-auto text-sm bg-gray-100 p-2 rounded">
            {diff}
          </pre>
        </div>
      )}
    </div>
  );
};

export default DiffPanel;