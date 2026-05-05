/**
 * Document Picture-in-Picture API 封装。
 *
 * 这是真正能"置顶到所有窗口之上"的 web 方案,Chrome 116+ / Edge 116+ 支持。
 * Firefox/Safari 暂不支持 — 调用 isSupported() 检查后 UI 降级。
 *
 * 关键点:PiP window 是另一个 document,不能跨 document 用 React 渲染同一个组件树。
 * 我们的做法:简单粗暴写一段 plain HTML/CSS 进 PiP window,通过 postMessage 同步状态。
 */

interface DocumentPictureInPicture {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
  window: Window | null
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

export function isPipSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

let pipWin: Window | null = null

export interface PipPayload {
  remainingMs: number
  totalMs: number
  mode: 'focus' | 'short_break' | 'long_break'
  status: 'idle' | 'running' | 'paused'
  taskName: string
}

const PIP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>番茄钟</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", sans-serif;
    background: linear-gradient(135deg, #FDE0C8 0%, #F8C8C0 50%, #E5C8E0 100%);
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #2A2926;
    overflow: hidden;
  }
  .mode {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(42, 41, 38, 0.6);
    margin-bottom: 8px;
  }
  .time {
    font-size: 56px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .task {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(42, 41, 38, 0.7);
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }
  .progress {
    margin-top: 12px;
    width: 70%;
    height: 4px;
    background: rgba(255,255,255,0.4);
    border-radius: 999px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #C8553D;
    transition: width 0.3s ease;
    border-radius: 999px;
  }
  .controls {
    margin-top: 16px;
    display: flex;
    gap: 8px;
  }
  button {
    background: rgba(255,255,255,0.6);
    border: 0.5px solid rgba(255,255,255,0.8);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
    color: #2A2926;
    backdrop-filter: blur(10px);
  }
  button:hover { background: rgba(255,255,255,0.85); }
  body.break { background: linear-gradient(135deg, #DCE8E5 0%, #C5CDDC 50%, #D5DCE0 100%); }
  body.break .progress-fill { background: #2D5F6F; }
</style>
</head>
<body>
  <div class="mode" id="mode">FOCUS</div>
  <div class="time" id="time">25:00</div>
  <div class="task" id="task"></div>
  <div class="progress"><div class="progress-fill" id="fill" style="width: 0%"></div></div>
  <div class="controls">
    <button id="btn-toggle">暂停</button>
    <button id="btn-stop">停止</button>
  </div>

<script>
  // BroadcastChannel:PiP window 和打开它的 main window 同源,可以双向通信
  var channel = new BroadcastChannel('bn-pomodoro-pip');
  channel.onmessage = function(e) {
    if (!e.data || e.data.source !== 'bn-pip-update') return;
    var p = e.data.payload;
    var total = Math.max(p.totalMs, 1);
    var elapsed = total - p.remainingMs;
    var ratio = Math.max(0, Math.min(1, elapsed / total));
    document.getElementById('fill').style.width = (ratio * 100) + '%';
    var m = Math.floor(p.remainingMs / 60000);
    var s = Math.floor((p.remainingMs % 60000) / 1000);
    document.getElementById('time').textContent = m + ':' + String(s).padStart(2, '0');
    document.getElementById('mode').textContent =
      p.mode === 'focus' ? 'FOCUS' : p.mode === 'short_break' ? 'BREAK' : 'LONG BREAK';
    document.getElementById('task').textContent = p.taskName || '';
    document.body.classList.toggle('break', p.mode !== 'focus');
    document.getElementById('btn-toggle').textContent =
      p.status === 'running' ? '暂停' : p.status === 'paused' ? '继续' : '开始';
  };
  function send(action) {
    channel.postMessage({ source: 'bn-pip-action', action: action });
  }
  document.getElementById('btn-toggle').addEventListener('click', function(){ send('toggle'); });
  document.getElementById('btn-stop').addEventListener('click', function(){ send('stop'); });
</script>
</body>
</html>
`

let actionChannel: BroadcastChannel | null = null

/** 打开 PiP 浮窗 */
export async function openPip(
  initial: PipPayload,
  onAction: (action: 'toggle' | 'stop') => void,
): Promise<boolean> {
  if (!isPipSupported()) return false
  if (pipWin && !pipWin.closed) {
    pipWin.focus()
    return true
  }

  try {
    pipWin = await window.documentPictureInPicture!.requestWindow({
      width: 280,
      height: 220,
    })

    pipWin.document.open()
    pipWin.document.write(PIP_HTML)
    pipWin.document.close()

    // 主 window 端订阅 action channel
    if (actionChannel) actionChannel.close()
    actionChannel = new BroadcastChannel('bn-pomodoro-pip')
    actionChannel.onmessage = (e: MessageEvent) => {
      if (!e.data || e.data.source !== 'bn-pip-action') return
      onAction(e.data.action)
    }

    pipWin.addEventListener('pagehide', () => {
      if (actionChannel) {
        actionChannel.close()
        actionChannel = null
      }
      pipWin = null
    })

    // 立即推一次状态(用 channel 而非 postMessage,确保 PiP script 已挂监听)
    setTimeout(() => sendPipUpdate(initial), 50)
    return true
  } catch {
    pipWin = null
    return false
  }
}

export function sendPipUpdate(payload: PipPayload): void {
  if (!pipWin || pipWin.closed) return
  // 通过 BroadcastChannel 推
  const ch = new BroadcastChannel('bn-pomodoro-pip')
  ch.postMessage({ source: 'bn-pip-update', payload })
  ch.close()
}

export function closePip(): void {
  if (pipWin && !pipWin.closed) {
    pipWin.close()
  }
  pipWin = null
}

export function isPipOpen(): boolean {
  return pipWin !== null && !pipWin.closed
}
