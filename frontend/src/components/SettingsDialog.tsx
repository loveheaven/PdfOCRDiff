import { useState } from "react";
import {
  getBackendUrl, setBackendUrl,
  getSaveDir, setSaveDir,
  getAutoSaveInterval, setAutoSaveInterval,
} from "../config";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [url, setUrl] = useState(getBackendUrl());
  const [saveDir, setSaveDirLocal] = useState(getSaveDir() || "~/Downloads");
  const [interval, setIntervalLocal] = useState(getAutoSaveInterval());
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

  if (!open) return null;

  const handleSave = () => {
    setBackendUrl(url);
    setSaveDir(saveDir);
    setAutoSaveInterval(interval);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleTest = async () => {
    setTestStatus("testing");
    setTestMsg("");
    const target = url.replace(/\/+$/, "");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${target}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setTestStatus("ok");
        setTestMsg(`连接成功 (${data.status || "ok"})`);
      } else {
        setTestStatus("fail");
        setTestMsg(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: unknown) {
      setTestStatus("fail");
      if (err instanceof DOMException && err.name === "AbortError") {
        setTestMsg("连接超时（5秒）");
      } else {
        setTestMsg(err instanceof Error ? err.message : "无法连接");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Backend URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">后端 OCR 服务地址</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setTestStatus("idle"); }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:8000"
              />
              <button
                onClick={handleTest}
                disabled={testStatus === "testing" || !url.trim()}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors shrink-0 ${
                  testStatus === "ok"
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : testStatus === "fail"
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {testStatus === "testing" ? "测试中..." : testStatus === "ok" ? "✓ 可连接" : testStatus === "fail" ? "✗ 失败" : "测试连接"}
              </button>
            </div>
            {testMsg && (
              <p className={`mt-1 text-xs ${testStatus === "ok" ? "text-green-600" : "text-red-500"}`}>
                {testMsg}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">本地部署填 http://localhost:8000，远程填服务器地址</p>
          </div>

          {/* Save directory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">保存路径</label>
            <input
              type="text"
              value={saveDir}
              onChange={(e) => setSaveDirLocal(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="~/Downloads"
            />
            <p className="mt-1 text-xs text-gray-400">.ocrdiff 项目文件夹和图片的保存位置（默认 ~/Downloads）</p>
          </div>

          {/* Auto-save interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">自动保存间隔（秒）</label>
            <input
              type="number"
              min={1}
              max={300}
              value={interval}
              onChange={(e) => setIntervalLocal(Math.max(1, Number(e.target.value)))}
              className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">编辑后每隔此时间自动保存一次版本，默认 10 秒</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {saved ? "✓ 已保存" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
