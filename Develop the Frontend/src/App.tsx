import { useEffect, useRef, useState } from "react";

type View = "home" | "project" | "studio" | "review";
type IconName =
  | "archive"
  | "check"
  | "chevron"
  | "clock"
  | "download"
  | "film"
  | "folder"
  | "grid"
  | "history"
  | "layers"
  | "menu"
  | "pause"
  | "play"
  | "plus"
  | "search"
  | "settings"
  | "spark"
  | "upload"
  | "volume"
  | "warning";

const paths: Record<IconName, React.ReactNode> = {
  archive: (
    <>
      <path d="M4 7h16v13H4z" />
      <path d="M3 3h18v4H3zM9 11h6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M5 20h14" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M7 4v16m10-16v16M3 8h4m10 0h4M3 16h4m10 0h4" />
    </>
  ),
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2-5.3L4 9" />
      <path d="M4 4v5h5M12 8v5l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.6-.6-1.4 1-1.9-2.1-2.1-1.9 1-1.4-.6-.6-2h-3l-.6 2-1.4.6-1.9-1-2.1 2.1 1 1.9-.6 1.4-2 .6v3l2 .6.6 1.4-1 1.9 2.1 2.1 1.9-1 1.4.6.6 2h3l.6-2 1.4-.6 1.9 1 2.1-2.1-1-1.9.6-1.4 2-.6Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2Z" />
      <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" />
    </>
  ),
  volume: (
    <>
      <path d="M5 10v4h4l4 4V6L9 10H5Z" />
      <path d="M16 9c1 1 1 5 0 6m2-8c2 2 2 8 0 10" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5m0 3v.1" />
    </>
  ),
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const watchStill =
  "https://images.unsplash.com/photo-1570849817099-dc7504de5391?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1600";
const roomStill =
  "https://images.unsplash.com/photo-1635483496741-75eb49e545f9?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1600";
const windowStill =
  "https://images.unsplash.com/photo-1585255318857-a4d4e39c8e67?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1600";
const chairStill =
  "https://images.unsplash.com/photo-1621963420375-e8d44b41058c?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1600";

const keyframes = [
  { time: 8, label: "00:08", image: roomStill, pos: "42% 58%" },
  { time: 17, label: "00:17", image: watchStill, pos: "42% 62%" },
  { time: 26, label: "00:26", image: roomStill, pos: "65% 52%" },
  { time: 38, label: "00:38", image: watchStill, pos: "72% 58%" },
  { time: 49, label: "00:49", image: windowStill, pos: "50% 54%" },
  { time: 61, label: "01:01", image: chairStill, pos: "45% 54%" },
  { time: 74, label: "01:14", image: roomStill, pos: "28% 52%" },
  { time: 86, label: "01:26", image: watchStill, pos: "60% 60%" },
];

const findings = [
  {
    id: 1,
    time: 38,
    end: 42,
    title: "Silver wristwatch not visible",
    type: "WARDROBE",
    severity: "high",
    detail: "Visible on the actor’s left wrist at 00:17; not visible at 00:38.",
  },
  {
    id: 2,
    time: 61,
    end: 64,
    title: "Glass position changed",
    type: "PROPS",
    severity: "medium",
    detail: "Drinking glass appears closer to the table edge in the later frame.",
  },
  {
    id: 3,
    time: 74,
    end: 78,
    title: "Practical light intensity",
    type: "LIGHTING",
    severity: "low",
    detail: "Background lamp appears brighter. This may be an intentional exposure change.",
  },
];

function Brand() {
  return (
    <div className="brand">
      <div className="brand-glyph">
        <i />
        <i />
        <i />
      </div>
      <div>
        <b>CONTINUITY</b>
        <b>GHOST</b>
      </div>
    </div>
  );
}

function AppNav({
  view,
  setView,
  open,
  onClose,
}: {
  view: View;
  setView: (view: View) => void;
  open: boolean;
  onClose: () => void;
}) {
  const go = (next: View) => {
    setView(next);
    onClose();
  };
  return (
    <aside className={`app-nav ${open ? "open" : ""}`}>
      <Brand />
      <nav aria-label="Application">
        <button className={view === "home" ? "active" : ""} onClick={() => go("home")}>
          <Icon name="grid" />
          <span>Projects</span>
        </button>
        <button className={view === "project" ? "active" : ""} onClick={() => go("project")}>
          <Icon name="folder" />
          <span>Scenes</span>
        </button>
        <button className={view === "studio" ? "active" : ""} onClick={() => go("studio")}>
          <Icon name="film" />
          <span>Studio</span>
        </button>
        <button className={view === "review" ? "active" : ""} onClick={() => go("review")}>
          <Icon name="history" />
          <span>Review</span>
          <em>5</em>
        </button>
      </nav>
      <div className="nav-foot">
        <button>
          <Icon name="settings" />
          <span>Settings</span>
        </button>
        <span className="avatar">AK</span>
      </div>
    </aside>
  );
}

function TopBar({ view, onMenu }: { view: View; onMenu: () => void }) {
  const labels = {
    home: "PROJECT LIBRARY",
    project: "HOLLOW FRAME / SCENES",
    studio: "SC. 03 / THE EXCHANGE / ANALYSIS",
    review: "REVIEW & HISTORY",
  };
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" />
      </button>
      <span className="crumb">{labels[view]}</span>
      <div className="topbar-actions">
        <span className="fixture">
          <i /> SYNTHETIC FIXTURE
        </span>
        <button aria-label="Search">
          <Icon name="search" size={17} />
        </button>
        <span className="online">LOCAL DEMO</span>
      </div>
    </header>
  );
}

function UploadButton({
  onUpload,
  children,
  primary = false,
}: {
  onUpload: (file: File) => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <label className={`upload-button ${primary ? "primary" : ""}`}>
      <Icon name="upload" size={16} />
      {children}
      <input
        type="file"
        accept="video/*"
        onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}
      />
    </label>
  );
}

function HomeDashboard({
  goStudio,
  goProject,
  onUpload,
}: {
  goStudio: () => void;
  goProject: () => void;
  onUpload: (file: File) => void;
}) {
  const projects = [
    {
      name: "Hollow Frame",
      meta: "18 scenes · 42 clips",
      image: roomStill,
      progress: 76,
      issues: 5,
      active: true,
    },
    {
      name: "After the Bell",
      meta: "24 scenes · 61 clips",
      image: windowStill,
      progress: 100,
      issues: 0,
    },
    { name: "Tide Line", meta: "9 scenes · 17 clips", image: chairStill, progress: 34, issues: 8 },
  ];
  return (
    <div className="page dashboard">
      <section className="page-title">
        <div>
          <span className="kicker">PRODUCTION WORKSPACE</span>
          <h1>Your continuity projects</h1>
          <p>
            Analyze takes, inspect timestamped differences, and resolve continuity before the edit.
          </p>
        </div>
        <div className="page-actions">
          <button className="ghost-button" onClick={goProject}>
            <Icon name="plus" /> NEW PROJECT
          </button>
          <UploadButton primary onUpload={onUpload}>
            UPLOAD VIDEO
          </UploadButton>
        </div>
      </section>
      <section className="metric-grid">
        <article>
          <small>ACTIVE PROJECTS</small>
          <strong>03</strong>
          <span>Across 51 scenes</span>
        </article>
        <article>
          <small>ANALYSIS QUEUE</small>
          <strong>02</strong>
          <span>
            <i className="amber" /> Processing 4 clips
          </span>
        </article>
        <article>
          <small>UNRESOLVED ISSUES</small>
          <strong className="coral-text">13</strong>
          <span>5 high significance</span>
        </article>
        <article>
          <small>REVIEWED THIS WEEK</small>
          <strong>47</strong>
          <span>
            <i className="sage" /> 86% complete
          </span>
        </article>
      </section>
      <div className="section-head">
        <div>
          <span>RECENT PROJECTS</span>
          <small>LAST UPDATED</small>
        </div>
        <button>
          VIEW ALL <Icon name="chevron" size={13} />
        </button>
      </div>
      <section className="project-grid">
        {projects.map((project) => (
          <button
            className="project-card"
            key={project.name}
            onClick={project.active ? goStudio : undefined}
          >
            <div className="project-art" style={{ backgroundImage: `url(${project.image})` }}>
              <span>16:9</span>
              {project.active && <em>ACTIVE</em>}
            </div>
            <div className="project-info">
              <small>FEATURE FILM · 2026</small>
              <h2>{project.name}</h2>
              <p>{project.meta}</p>
              <div className="progress">
                <i style={{ width: `${project.progress}%` }} />
              </div>
              <footer>
                <span>{project.progress}% ANALYZED</span>
                <b className={project.issues ? "has-issues" : ""}>
                  {project.issues ? `${project.issues} OPEN ISSUES` : "REVIEW COMPLETE"}
                </b>
              </footer>
            </div>
          </button>
        ))}
        <label className="new-project-card">
          <Icon name="upload" size={24} />
          <b>Start from footage</b>
          <span>Drop a video or browse files</span>
          <input
            type="file"
            accept="video/*"
            onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}
          />
        </label>
      </section>
      <section className="dashboard-lower">
        <div>
          <div className="section-head">
            <div>
              <span>RECENT ACTIVITY</span>
            </div>
            <button>
              OPEN REVIEW <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="activity-list">
            <div>
              <span className="activity-icon issue">
                <Icon name="warning" size={15} />
              </span>
              <p>
                <b>Wristwatch difference detected</b>
                <small>Hollow Frame · Scene 03 · 00:38</small>
              </p>
              <time>12 MIN</time>
            </div>
            <div>
              <span className="activity-icon done">
                <Icon name="check" size={15} />
              </span>
              <p>
                <b>Scene 02 review completed</b>
                <small>Hollow Frame · 8 findings reviewed</small>
              </p>
              <time>1 HR</time>
            </div>
            <div>
              <span className="activity-icon">
                <Icon name="spark" size={15} />
              </span>
              <p>
                <b>Analysis finished</b>
                <small>After the Bell · Scene 18 · Take 04</small>
              </p>
              <time>3 HR</time>
            </div>
          </div>
        </div>
        <aside className="processing-card">
          <div>
            <span className="processing-orbit">
              <Icon name="spark" />
            </span>
            <div>
              <small>ANALYSIS IN PROGRESS</small>
              <h3>Tide Line · Scene 06</h3>
            </div>
            <b>68%</b>
          </div>
          <p>Extracting keyframes and tracking visual continuity across 3 takes.</p>
          <div className="processing-bar">
            <i />
          </div>
          <footer>
            <span>TAKE_06B.MOV</span>
            <span>EST. 01:42</span>
          </footer>
        </aside>
      </section>
    </div>
  );
}

function ProjectWorkspace({
  openStudio,
  onUpload,
  processing,
}: {
  openStudio: () => void;
  onUpload: (file: File) => void;
  processing: boolean;
}) {
  const scenes = [
    {
      n: "01",
      name: "The Arrival",
      place: "EXT. TRAIN PLATFORM · DAWN",
      clips: 4,
      time: "04:18",
      state: "complete",
      issues: 0,
      image: windowStill,
    },
    {
      n: "02",
      name: "Hotel Lobby",
      place: "INT. GRAND HOTEL · DAY",
      clips: 6,
      time: "08:42",
      state: "review",
      issues: 2,
      image: chairStill,
    },
    {
      n: "03",
      name: "The Exchange",
      place: "INT. HOTEL ROOM · NIGHT",
      clips: 5,
      time: "06:24",
      state: "active",
      issues: 3,
      image: roomStill,
    },
    {
      n: "04",
      name: "Fire Escape",
      place: "EXT. HOTEL · NIGHT",
      clips: 3,
      time: "03:51",
      state: processing ? "processing" : "ready",
      issues: 0,
      image: watchStill,
    },
  ];
  return (
    <div className="page project-page">
      <section className="project-hero">
        <div className="project-poster" style={{ backgroundImage: `url(${roomStill})` }} />
        <div>
          <span className="kicker">FEATURE FILM · ACTIVE PRODUCTION</span>
          <h1>Hollow Frame</h1>
          <p>Dir. Maya Chen · Continuity: Alex Kim</p>
          <div className="project-meta">
            <span>
              <b>18</b> SCENES
            </span>
            <span>
              <b>42</b> CLIPS
            </span>
            <span>
              <b>76%</b> ANALYZED
            </span>
            <span>
              <b className="coral-text">05</b> OPEN ISSUES
            </span>
          </div>
        </div>
        <UploadButton primary onUpload={onUpload}>
          UPLOAD VIDEO
        </UploadButton>
      </section>
      <div className="scene-toolbar">
        <div>
          <button className="active">
            ALL SCENES <span>18</span>
          </button>
          <button>
            NEEDS REVIEW <span>5</span>
          </button>
          <button>
            PROCESSING <span>{processing ? 2 : 1}</span>
          </button>
        </div>
        <label>
          <Icon name="search" size={15} />
          <input placeholder="Search scenes…" />
        </label>
      </div>
      <section className="scene-table">
        <header>
          <span>SCENE</span>
          <span>CLIPS</span>
          <span>DURATION</span>
          <span>STATUS</span>
          <span>ISSUES</span>
          <span />
        </header>
        {scenes.map((scene) => (
          <button
            className="scene-row"
            key={scene.n}
            onClick={scene.n === "03" ? openStudio : undefined}
          >
            <span className="scene-identity">
              <em>{scene.n}</em>
              <i style={{ backgroundImage: `url(${scene.image})` }} />
              <span>
                <b>{scene.name}</b>
                <small>{scene.place}</small>
              </span>
            </span>
            <span>{scene.clips} TAKES</span>
            <span>{scene.time}</span>
            <span>
              <mark className={scene.state}>
                {scene.state === "complete" ? "REVIEWED" : scene.state.toUpperCase()}
              </mark>
            </span>
            <span className={scene.issues ? "issue-count" : ""}>
              {scene.issues ? `${String(scene.issues).padStart(2, "0")} OPEN` : "—"}
            </span>
            <span>
              <Icon name="chevron" size={15} />
            </span>
          </button>
        ))}
      </section>
      <button className="add-scene">
        <Icon name="plus" /> ADD SCENE
      </button>
    </div>
  );
}

function VideoPlayer({
  time,
  duration,
  playing,
  setPlaying,
  onTime,
}: {
  time: number;
  duration: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  onTime: (v: number) => void;
}) {
  const active = keyframes.reduce(
    (best, frame) => (Math.abs(frame.time - time) < Math.abs(best.time - time) ? frame : best),
    keyframes[0],
  );
  return (
    <div className="video-player">
      <div
        className="video-image"
        style={{ backgroundImage: `url(${active.image})`, backgroundPosition: active.pos }}
      >
        <div className="video-safe">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="camera-label">CAM A · TAKE 07</span>
        <span className="player-timecode">
          01:16:{String(Math.floor(time)).padStart(2, "0")}:12
        </span>
        {!playing && (
          <button className="big-play" onClick={() => setPlaying(true)} aria-label="Play">
            <Icon name="play" size={25} />
          </button>
        )}
      </div>
      <div className="player-controls">
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span>{formatTime(time)}</span>
        <input
          aria-label="Video progress"
          type="range"
          min="0"
          max={duration}
          step=".1"
          value={time}
          onChange={(e) => onTime(Number(e.target.value))}
        />
        <span>{formatTime(duration)}</span>
        <button aria-label="Volume">
          <Icon name="volume" size={16} />
        </button>
        <button>1×</button>
        <button>FULL</button>
      </div>
    </div>
  );
}

function Timeline({
  time,
  duration,
  onTime,
  selected,
  onIssue,
}: {
  time: number;
  duration: number;
  onTime: (v: number) => void;
  selected: number;
  onIssue: (id: number, time: number) => void;
}) {
  return (
    <section className="timeline-panel">
      <header>
        <div>
          <span>TIMELINE</span>
          <b>CAM A · TAKE 07</b>
        </div>
        <div className="timeline-legend">
          <span>
            <i className="high" /> HIGH
          </span>
          <span>
            <i className="medium" /> MEDIUM
          </span>
          <span>
            <i className="low" /> LOW
          </span>
        </div>
        <div className="timeline-zoom">
          <button>−</button>
          <span>100%</span>
          <button>+</button>
        </div>
      </header>
      <div className="ruler">
        {[0, 15, 30, 45, 60, 75, 90].map((n) => (
          <span key={n} style={{ left: `${(n / duration) * 100}%` }}>
            {formatTime(n)}
          </span>
        ))}
      </div>
      <div className="filmstrip">
        {keyframes.map((frame) => (
          <button
            key={frame.time}
            className={Math.abs(frame.time - time) < 5 ? "active" : ""}
            onClick={() => onTime(frame.time)}
          >
            <span
              style={{ backgroundImage: `url(${frame.image})`, backgroundPosition: frame.pos }}
            />
            <small>{frame.label}</small>
          </button>
        ))}
        <div className="playhead" style={{ left: `${(time / duration) * 100}%` }}>
          <i />
          <span />
        </div>
        <input
          aria-label="Scrub video timeline"
          type="range"
          min="0"
          max={duration}
          step=".1"
          value={time}
          onChange={(e) => onTime(Number(e.target.value))}
        />
      </div>
      <div className="issue-track">
        <span className="track-title">ISSUES</span>
        <div>
          {findings.map((finding) => (
            <button
              key={finding.id}
              className={`${finding.severity} ${selected === finding.id ? "active" : ""}`}
              style={{ left: `${(finding.time / duration) * 100}%` }}
              onClick={() => onIssue(finding.id, finding.time)}
              aria-label={`${finding.title} at ${formatTime(finding.time)}`}
            >
              <i>{finding.id}</i>
              <span>{finding.type}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function FindingsPanel({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (id: number, time: number) => void;
}) {
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const finding = findings.find((item) => item.id === selected) ?? findings[0];
  return (
    <aside className="findings-panel">
      <header>
        <div>
          <small>AI ANALYSIS · SYNTHETIC</small>
          <h2>
            Findings <span>03</span>
          </h2>
        </div>
        <button>
          <Icon name="search" size={16} />
        </button>
      </header>
      <div className="finding-tabs">
        <button className="active">
          OPEN <span>3</span>
        </button>
        <button>
          REVIEWED <span>8</span>
        </button>
      </div>
      <div className="finding-nav">
        {findings.map((item) => (
          <button
            className={item.id === selected ? "active" : ""}
            key={item.id}
            onClick={() => onSelect(item.id, item.time)}
          >
            <i className={item.severity}>{String(item.id).padStart(2, "0")}</i>
            <span>
              <small>
                {formatTime(item.time)} · {item.type}
              </small>
              <b>{item.title}</b>
            </span>
            <Icon name="chevron" size={13} />
          </button>
        ))}
      </div>
      <article className="finding-detail">
        <div className="detail-meta">
          <span className={finding.severity}>{finding.severity.toUpperCase()} SIGNIFICANCE</span>
          <time>
            {formatTime(finding.time)} → {formatTime(finding.end)}
          </time>
        </div>
        <h3>{finding.title}</h3>
        <p>{finding.detail}</p>
        <div className="evidence-pair">
          <div>
            <span>FRAME A · 00:17</span>
            <i style={{ backgroundImage: `url(${watchStill})`, backgroundPosition: "40% 62%" }}>
              <em>01</em>
            </i>
            <small>Watch visible</small>
          </div>
          <div>
            <span>FRAME B · 00:38</span>
            <i style={{ backgroundImage: `url(${watchStill})`, backgroundPosition: "76% 58%" }}>
              <em>01</em>
            </i>
            <small>Watch not visible</small>
          </div>
        </div>
        <div className="finding-callout">
          <Icon name="warning" size={15} />
          <div>
            <span>POTENTIAL CONTINUITY ERROR</span>
            <p>Possible wardrobe inconsistency. Confirm against the approved continuity state.</p>
          </div>
        </div>
        <div className="uncertainty">
          <span>MODEL CERTAINTY</span>
          <div>
            <i />
            <i />
            <i />
            <i className="off" />
            <i className="off" />
          </div>
          <b>MODERATE</b>
        </div>
        <span className="decision-label">REVIEW DECISION</span>
        <div className="decision-buttons">
          <button
            className={decisions[finding.id] === "confirm" ? "selected confirm" : ""}
            onClick={() => setDecisions({ ...decisions, [finding.id]: "confirm" })}
          >
            <Icon name="check" size={14} /> CONFIRM
          </button>
          <button
            className={decisions[finding.id] === "dismiss" ? "selected dismiss" : ""}
            onClick={() => setDecisions({ ...decisions, [finding.id]: "dismiss" })}
          >
            × DISMISS
          </button>
          <button
            className={decisions[finding.id] === "later" ? "selected later" : ""}
            onClick={() => setDecisions({ ...decisions, [finding.id]: "later" })}
          >
            <Icon name="clock" size={14} /> LATER
          </button>
        </div>
        {decisions[finding.id] && (
          <div className={`decision-saved ${decisions[finding.id]}`}>
            <Icon name="check" size={13} /> Decision saved to review history
          </div>
        )}
      </article>
    </aside>
  );
}

function Comparison({
  mode,
  setMode,
  zoom,
  setZoom,
}: {
  mode: "side" | "overlay";
  setMode: (v: "side" | "overlay") => void;
  zoom: number;
  setZoom: (v: number) => void;
}) {
  const [blend, setBlend] = useState(50);
  return (
    <section className="comparison-panel">
      <header>
        <div>
          <span>KEYFRAME COMPARISON</span>
          <small>ISSUE 01 · WRISTWATCH</small>
        </div>
        <div className="compare-tools">
          <button className={mode === "side" ? "active" : ""} onClick={() => setMode("side")}>
            <Icon name="layers" size={14} /> SIDE BY SIDE
          </button>
          <button className={mode === "overlay" ? "active" : ""} onClick={() => setMode("overlay")}>
            ◐ OVERLAY
          </button>
          <span />
          <button onClick={() => setZoom(Math.max(100, zoom - 10))}>−</button>
          <b>{zoom}%</b>
          <button onClick={() => setZoom(Math.min(140, zoom + 10))}>+</button>
        </div>
      </header>
      {mode === "side" ? (
        <div className="compare-frames">
          <Frame label="FRAME A" time="00:17.04" position="40% 62%" zoom={zoom} />
          <Frame label="FRAME B" time="00:38.12" position="76% 58%" zoom={zoom} changed />
        </div>
      ) : (
        <div className="overlay-frame">
          <Frame label="FRAME A" time="00:17.04" position="40% 62%" zoom={zoom} />
          <div className="overlay-b" style={{ clipPath: `inset(0 0 0 ${blend}%)` }}>
            <Frame label="FRAME B" time="00:38.12" position="76% 58%" zoom={zoom} changed />
          </div>
          <i style={{ left: `${blend}%` }} />
          <input
            aria-label="Overlay blend position"
            type="range"
            min="5"
            max="95"
            value={blend}
            onChange={(e) => setBlend(Number(e.target.value))}
          />
        </div>
      )}
    </section>
  );
}

function Frame({
  label,
  time,
  position,
  zoom,
  changed = false,
}: {
  label: string;
  time: string;
  position: string;
  zoom: number;
  changed?: boolean;
}) {
  return (
    <div className={`compare-frame ${changed ? "changed" : ""}`}>
      <div className="frame-head">
        <span>
          <i /> {label}
        </span>
        <time>{time}</time>
      </div>
      <div className="frame-image">
        <img
          src={watchStill}
          alt={`${label} selected video keyframe`}
          style={{ objectPosition: position, transform: `scale(${zoom / 100})` }}
        />
        <span className="marker">01</span>
      </div>
    </div>
  );
}

function VideoStudio() {
  const duration = 90;
  const [time, setTime] = useState(38);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(1);
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(
      () => setTime((value) => (value >= duration ? 0 : value + 0.25)),
      250,
    );
    return () => window.clearInterval(interval);
  }, [playing]);
  const selectIssue = (id: number, at: number) => {
    setSelected(id);
    setTime(at);
    setPlaying(false);
  };
  const exportReport = () => {
    const report = {
      project: "Hollow Frame",
      scene: "SC. 03 — The Exchange",
      fixture: true,
      findings,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    a.download = "hollow-frame-sc03-continuity-report-demo.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="studio-page">
      <header className="studio-head">
        <div>
          <span className="kicker">SCENE 03 · SHOT 04</span>
          <h1>The Exchange</h1>
          <p>INT. HOTEL ROOM · NIGHT</p>
        </div>
        <div className="clip-switch">
          <small>ANALYZING CLIP</small>
          <button>
            CAM A · TAKE 07 <Icon name="chevron" size={13} />
          </button>
        </div>
        <button className="export-button" onClick={exportReport}>
          <Icon name="download" size={14} /> EXPORT REPORT
        </button>
      </header>
      <div className="studio-grid">
        <main className="studio-main">
          <VideoPlayer
            time={time}
            duration={duration}
            playing={playing}
            setPlaying={setPlaying}
            onTime={setTime}
          />
          <Timeline
            time={time}
            duration={duration}
            onTime={setTime}
            selected={selected}
            onIssue={selectIssue}
          />
          <Comparison mode={mode} setMode={setMode} zoom={zoom} setZoom={setZoom} />
        </main>
        <FindingsPanel selected={selected} onSelect={selectIssue} />
      </div>
      <footer className="status-strip">
        <span>
          <i /> ANALYSIS COMPLETE · SYNTHETIC FIXTURE
        </span>
        <span>
          MODEL <b>GEMINI · CONNECTION PENDING</b>
        </span>
        <span>
          KEYFRAMES <b>128 EXTRACTED</b>
        </span>
        <span>
          LAST RUN <b>2 MIN AGO</b>
        </span>
      </footer>
    </div>
  );
}

function ReviewHistory() {
  const [filter, setFilter] = useState("ALL");
  const exportReport = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify({ project: "Hollow Frame", fixture: true, findings }, null, 2)], {
        type: "application/json",
      }),
    );
    a.download = "continuity-report-demo.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const rows = [
    ["SC. 03", "The Exchange", "00:38", "Wristwatch not visible", "HIGH", "OPEN", "—"],
    ["SC. 03", "The Exchange", "01:14", "Practical light intensity", "LOW", "LATER", "Alex Kim"],
    [
      "SC. 02",
      "Hotel Lobby",
      "02:06",
      "Background extra position",
      "MEDIUM",
      "CONFIRMED",
      "Alex Kim",
    ],
    ["SC. 02", "Hotel Lobby", "03:42", "Coat collar orientation", "LOW", "DISMISSED", "Morgan Lee"],
    ["SC. 01", "The Arrival", "00:54", "Briefcase hand changed", "HIGH", "CONFIRMED", "Alex Kim"],
  ];
  return (
    <div className="page review-page">
      <section className="page-title">
        <div>
          <span className="kicker">CONTINUITY LOG</span>
          <h1>Review & history</h1>
          <p>Track findings, reviewer decisions, and previous analyses across the production.</p>
        </div>
        <button className="upload-button primary" onClick={exportReport}>
          <Icon name="download" size={15} /> EXPORT REPORT
        </button>
      </section>
      <section className="review-summary">
        <article>
          <small>OPEN</small>
          <strong>05</strong>
          <span>Needs a decision</span>
        </article>
        <article>
          <small>CONFIRMED</small>
          <strong>18</strong>
          <span>Continuity errors</span>
        </article>
        <article>
          <small>DISMISSED</small>
          <strong>24</strong>
          <span>Intentional changes</span>
        </article>
        <article>
          <small>REVIEW LATER</small>
          <strong>03</strong>
          <span>Awaiting context</span>
        </article>
      </section>
      <div className="review-tools">
        <div>
          {["ALL", "OPEN", "CONFIRMED", "DISMISSED", "LATER"].map((item) => (
            <button
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <label>
          <Icon name="search" size={14} />
          <input placeholder="Search findings…" />
        </label>
      </div>
      <section className="history-table">
        <header>
          <span>SCENE</span>
          <span>TIMESTAMP</span>
          <span>FINDING</span>
          <span>SIGNIFICANCE</span>
          <span>STATUS</span>
          <span>REVIEWER</span>
          <span />
        </header>
        {rows
          .filter((row) => filter === "ALL" || row[5] === filter)
          .map((row) => (
            <button key={row.join("-")}>
              <span>
                <b>{row[0]}</b>
                <small>{row[1]}</small>
              </span>
              <span>{row[2]}</span>
              <span>{row[3]}</span>
              <span>
                <mark className={row[4].toLowerCase()}>{row[4]}</mark>
              </span>
              <span>
                <mark className={`status-${row[5].toLowerCase()}`}>{row[5]}</mark>
              </span>
              <span>{row[6]}</span>
              <span>
                <Icon name="chevron" size={14} />
              </span>
            </button>
          ))}
      </section>
      <div className="analysis-history">
        <div className="section-head">
          <div>
            <span>PREVIOUS ANALYSES</span>
          </div>
        </div>
        <article>
          <span className="activity-icon done">
            <Icon name="check" />
          </span>
          <div>
            <b>Scene 03 · Take 07</b>
            <small>Completed today at 14:32 · 128 keyframes · 3 findings</small>
          </div>
          <button>
            VIEW RUN <Icon name="chevron" size={13} />
          </button>
        </article>
        <article>
          <span className="activity-icon">
            <Icon name="archive" />
          </span>
          <div>
            <b>Scene 02 · Take 04</b>
            <small>Completed yesterday at 18:06 · 164 keyframes · 8 findings</small>
          </div>
          <button>
            VIEW RUN <Icon name="chevron" size={13} />
          </button>
        </article>
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function App() {
  const [view, setView] = useState<View>("studio");
  const [navOpen, setNavOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const upload = (_file: File) => {
    setProcessing(true);
    setView("project");
    timer.current = window.setTimeout(() => setProcessing(false), 5000);
  };
  return (
    <div className="app-shell">
      <AppNav view={view} setView={setView} open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <button
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="app-content">
        <TopBar view={view} onMenu={() => setNavOpen(true)} />
        {view === "home" && (
          <HomeDashboard
            goStudio={() => setView("studio")}
            goProject={() => setView("project")}
            onUpload={upload}
          />
        )}
        {view === "project" && (
          <ProjectWorkspace
            openStudio={() => setView("studio")}
            onUpload={upload}
            processing={processing}
          />
        )}
        {view === "studio" && <VideoStudio />}
        {view === "review" && <ReviewHistory />}
      </div>
    </div>
  );
}
