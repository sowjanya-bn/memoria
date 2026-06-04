/**
 * FlowCanvas — transparent canvas overlay drawn on top of Cytoscape.
 * Animates glowing particles traveling along edges, node to node.
 * Exposed via ref: flowAlongPath(points, color)
 *   points: [{x, y}, ...] — screen-space positions (one per node in path)
 *   color: start hue (degrees)
 */
import { useRef, useImperativeHandle, forwardRef, useEffect } from "react";

const PARTICLE_RADIUS  = 7;
const TRAIL_LENGTH     = 22;   // number of tail segments
const PARTICLE_SPEED   = 1.2;  // px per frame (slowed down)
const GLOW_BLUR        = 28;

const FlowCanvas = forwardRef(function FlowCanvas({ style }, ref) {
  const canvasRef  = useRef(null);
  const jobsRef    = useRef([]);   // active animations
  const rafRef     = useRef(null);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function loop() {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      jobsRef.current = jobsRef.current.filter((job) => {
        drawJob(ctx, job);
        return !job.done;
      });

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  function drawJob(ctx, job) {
    if (job.segIdx >= job.segments.length) { job.done = true; return; }

    const seg = job.segments[job.segIdx];
    const dx  = seg.tx - seg.sx;
    const dy  = seg.ty - seg.sy;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) { job.segIdx++; return; }

    job.t += PARTICLE_SPEED / len;
    if (job.t >= 1) {
      job.t = 0;
      job.segIdx++;
      // Pulse target node briefly via callback
      if (job.onArrive && job.segIdx <= job.segments.length) {
        job.onArrive(job.segIdx - 1);
      }
      if (job.segIdx >= job.segments.length) { job.done = true; return; }
    }

    const cx = seg.sx + dx * job.t;
    const cy = seg.sy + dy * job.t;

    // Fade envelope: ramp from 0→1 over first half of segment, hold at 1 for second half
    const envelope = Math.min(1, job.t / 0.5);

    // Trail
    const hue = job.hue + (job.segIdx / job.segments.length) * 60;
    for (let i = TRAIL_LENGTH; i >= 0; i--) {
      const tb   = Math.max(0, job.t - (i / TRAIL_LENGTH) * (PARTICLE_SPEED * TRAIL_LENGTH) / len);
      const tx   = seg.sx + dx * tb;
      const ty   = seg.sy + dy * tb;
      const alpha = (1 - i / TRAIL_LENGTH) * 0.6 * envelope;
      const r    = PARTICLE_RADIUS * (1 - i / TRAIL_LENGTH) * 0.8;

      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
      ctx.fill();
    }

    // Head glow
    const headHue = hue;
    ctx.save();
    ctx.globalAlpha = envelope;
    ctx.shadowColor = `hsl(${headHue}, 95%, 70%)`;
    ctx.shadowBlur  = GLOW_BLUR;
    ctx.beginPath();
    ctx.arc(cx, cy, PARTICLE_RADIUS, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, PARTICLE_RADIUS);
    grad.addColorStop(0, `hsla(${headHue}, 100%, 90%, 1)`);
    grad.addColorStop(1, `hsla(${headHue}, 85%, 60%, 0.6)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  useImperativeHandle(ref, () => ({
    flowAlongPath(points, hue = 260, onArrive) {
      if (points.length < 2) return;
      const segments = points.slice(0, -1).map((p, i) => ({
        sx: p.x, sy: p.y,
        tx: points[i + 1].x, ty: points[i + 1].y,
      }));
      jobsRef.current.push({ segments, segIdx: 0, t: 0, hue, done: false, onArrive });
    },

    clear() {
      jobsRef.current = [];
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
        zIndex: 2,
        ...style,
      }}
    />
  );
});

export default FlowCanvas;
