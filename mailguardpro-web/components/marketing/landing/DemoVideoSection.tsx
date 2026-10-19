"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Landing product-demo section.
 *
 * - The video is lazy: it only starts downloading/playing when it scrolls
 *   into view and pauses when it leaves the viewport.
 * - Fixed 16:9 dimensions (width/height + aspect-video) prevent layout shift.
 * - `prefers-reduced-motion` disables the reveal animation and autoplay;
 *   native controls are shown instead so the demo stays opt-in.
 */
export function DemoVideoSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(prefersReduced);

    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);

        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting && !prefersReduced) {
          video.play().catch(() => {
            // Autoplay can be blocked — the poster remains visible.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="pb-20 md:pb-24" aria-labelledby="demo-video-heading">
      <div className="max-w-[var(--container-lg)] mx-auto px-6">
        <div
          ref={sectionRef}
          className={`transition-all duration-700 ease-[var(--ease-out-quart)] motion-reduce:transition-none ${
            visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0"
          }`}
        >
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase text-[var(--accent)] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              Product demo
            </span>
            <h2
              id="demo-video-heading"
              className="text-3xl md:text-4xl font-display font-bold text-[var(--text-primary)]"
            >
              See it in action
            </h2>
            <p className="mt-3 text-lg text-[var(--text-secondary)] leading-relaxed">
              From a single address to a 100k-row list — the whole workflow, in under a minute.
            </p>
          </div>

          <div className="relative mx-auto max-w-4xl">
            <div
              aria-hidden="true"
              className="absolute -inset-4 md:-inset-6 rounded-[32px] bg-[var(--accent)]/[0.07] blur-3xl"
            />
            <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]">
              <video
                ref={videoRef}
                className="block w-full aspect-video h-auto"
                width={1280}
                height={720}
                poster="/videos/demo-poster.jpg"
                muted
                loop
                playsInline
                preload="none"
                controls={reducedMotion}
                aria-label="MailGuard Pro product demo: score a single email, validate a CSV in bulk, then export the results."
              >
                <source src="/videos/demo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
            0–100 quality score &middot; real-time validation &middot; CSV bulk processing &middot;
            one-click exports
          </p>
        </div>
      </div>
    </section>
  );
}
