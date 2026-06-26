
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, useScroll, useTransform, useInView } from 'framer-motion';
import { useGesture } from '@use-gesture/react';
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import baffle from 'baffle';
import { FloatingParticles, AuroraBackground, GradientOrbs, Starfield, NeonGrid, HolographicShimmer } from './AnimatedBackgrounds';

            // ==========================================
            // DomeGallery Implementation
            // ==========================================
            const DEFAULTS = {
              maxVerticalRotationDeg: 5,
              dragSensitivity: 20,
              enlargeTransitionMs: 300,
              segments: 35
            };

            const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
            const normalizeAngle = d => ((d % 360) + 360) % 360;
            const wrapAngleSigned = deg => {
              const a = (((deg + 180) % 360) + 360) % 360;
              return a - 180;
            };
            const getDataNumber = (el, name, fallback) => {
              const attr = el.dataset[name] ?? el.getAttribute(`data-${name}`);
              const n = attr == null ? NaN : parseFloat(attr);
              return Number.isFinite(n) ? n : fallback;
            };

            function buildItems(pool, seg) {
              const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
              const evenYs = [-4, -2, 0, 2, 4];
              const oddYs = [-3, -1, 1, 3, 5];

              const coords = xCols.flatMap((x, c) => {
                const ys = c % 2 === 0 ? evenYs : oddYs;
                return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }));
              });

              const totalSlots = coords.length;
              if (pool.length === 0) {
                return coords.map(c => ({ ...c, src: '', alt: '' }));
              }

              const normalizedImages = pool.map(image => {
                if (typeof image === 'string') {
                  return { src: image, alt: '' };
                }
                return { src: image.src || '', alt: image.alt || '' };
              });

              const usedImages = Array.from({ length: totalSlots }, (_, i) => normalizedImages[i % normalizedImages.length]);

              for (let i = 1; i < usedImages.length; i++) {
                if (usedImages[i].src === usedImages[i - 1].src) {
                  for (let j = i + 1; j < usedImages.length; j++) {
                    if (usedImages[j].src !== usedImages[i].src) {
                      const tmp = usedImages[i];
                      usedImages[i] = usedImages[j];
                      usedImages[j] = tmp;
                      break;
                    }
                  }
                }
              }

              return coords.map((c, i) => ({
                ...c,
                src: usedImages[i].src,
                alt: usedImages[i].alt
              }));
            }

            function computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, segments) {
              const unit = 360 / segments / 2;
              const rotateY = unit * (offsetX + (sizeX - 1) / 2);
              const rotateX = unit * (offsetY - (sizeY - 1) / 2);
              return { rotateX, rotateY };
            }

            function DomeGallery({
              images,
              fit = 0.5,
              fitBasis = 'auto',
              minRadius = 600,
              maxRadius = Infinity,
              padFactor = 0.25,
              overlayBlurColor = '#120F17',
              maxVerticalRotationDeg = DEFAULTS.maxVerticalRotationDeg,
              dragSensitivity = DEFAULTS.dragSensitivity,
              enlargeTransitionMs = DEFAULTS.enlargeTransitionMs,
              segments = DEFAULTS.segments,
              dragDampening = 2,
              openedImageWidth = '250px',
              openedImageHeight = '350px',
              imageBorderRadius = '30px',
              openedImageBorderRadius = '30px',
              grayscale = true
            }) {
              const rootRef = useRef(null);
              const mainRef = useRef(null);
              const sphereRef = useRef(null);
              const frameRef = useRef(null);
              const viewerRef = useRef(null);
              const scrimRef = useRef(null);
              const focusedElRef = useRef(null);
              const originalTilePositionRef = useRef(null);

              const rotationRef = useRef({ x: 0, y: 0 });
              const startRotRef = useRef({ x: 0, y: 0 });
              const startPosRef = useRef(null);
              const draggingRef = useRef(false);
              const movedRef = useRef(false);
              const inertiaRAF = useRef(null);
              const openingRef = useRef(false);
              const openStartedAtRef = useRef(0);
              const lastDragEndAt = useRef(0);

              const scrollLockedRef = useRef(false);
              const lockScroll = useCallback(() => {
                if (scrollLockedRef.current) return;
                scrollLockedRef.current = true;
                document.body.classList.add('dg-scroll-lock');
              }, []);
              const unlockScroll = useCallback(() => {
                if (!scrollLockedRef.current) return;
                if (rootRef.current?.getAttribute('data-enlarging') === 'true') return;
                scrollLockedRef.current = false;
                document.body.classList.remove('dg-scroll-lock');
              }, []);

              const items = useMemo(() => buildItems(images, segments), [images, segments]);

              const applyTransform = (xDeg, yDeg) => {
                const el = sphereRef.current;
                if (el) {
                  el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
                }
              };

              const lockedRadiusRef = useRef(null);

              useEffect(() => {
                const root = rootRef.current;
                if (!root) return;
                const ro = new ResizeObserver(entries => {
                  const cr = entries[0].contentRect;
                  const w = Math.max(1, cr.width),
                    h = Math.max(1, cr.height);
                  const minDim = Math.min(w, h),
                    maxDim = Math.max(w, h),
                    aspect = w / h;
                  let basis;
                  switch (fitBasis) {
                    case 'min':
                      basis = minDim;
                      break;
                    case 'max':
                      basis = maxDim;
                      break;
                    case 'width':
                      basis = w;
                      break;
                    case 'height':
                      basis = h;
                      break;
                    default:
                      basis = aspect >= 1.3 ? w : minDim;
                  }
                  let radius = basis * fit;
                  const heightGuard = h * 1.35;
                  radius = Math.min(radius, heightGuard);
                  radius = clamp(radius, minRadius, maxRadius);
                  lockedRadiusRef.current = Math.round(radius);

                  const viewerPad = Math.max(8, Math.round(minDim * padFactor));
                  root.style.setProperty('--radius', `${lockedRadiusRef.current}px`);
                  root.style.setProperty('--viewer-pad', `${viewerPad}px`);
                  root.style.setProperty('--overlay-blur-color', overlayBlurColor);
                  root.style.setProperty('--tile-radius', imageBorderRadius);
                  root.style.setProperty('--enlarge-radius', openedImageBorderRadius);
                  root.style.setProperty('--image-filter', grayscale ? 'grayscale(1)' : 'none');
                  applyTransform(rotationRef.current.x, rotationRef.current.y);

                  const enlargedOverlay = viewerRef.current?.querySelector('.enlarge');
                  if (enlargedOverlay && frameRef.current && mainRef.current) {
                    const frameR = frameRef.current.getBoundingClientRect();
                    const mainR = mainRef.current.getBoundingClientRect();

                    const hasCustomSize = openedImageWidth && openedImageHeight;
                    if (hasCustomSize) {
                      const tempDiv = document.createElement('div');
                      tempDiv.style.cssText = `position: absolute; width: ${openedImageWidth}; height: ${openedImageHeight}; visibility: hidden;`;
                      document.body.appendChild(tempDiv);
                      const tempRect = tempDiv.getBoundingClientRect();
                      document.body.removeChild(tempDiv);

                      const centeredLeft = frameR.left - mainR.left + (frameR.width - tempRect.width) / 2;
                      const centeredTop = frameR.top - mainR.top + (frameR.height - tempRect.height) / 2;

                      enlargedOverlay.style.left = `${centeredLeft}px`;
                      enlargedOverlay.style.top = `${centeredTop}px`;
                    } else {
                      enlargedOverlay.style.left = `${frameR.left - mainR.left}px`;
                      enlargedOverlay.style.top = `${frameR.top - mainR.top}px`;
                      enlargedOverlay.style.width = `${frameR.width}px`;
                      enlargedOverlay.style.height = `${frameR.height}px`;
                    }
                  }
                });
                ro.observe(root);
                return () => ro.disconnect();
              }, [fit, fitBasis, minRadius, maxRadius, padFactor, overlayBlurColor, grayscale, imageBorderRadius, openedImageBorderRadius, openedImageWidth, openedImageHeight]);

              useEffect(() => {
                applyTransform(rotationRef.current.x, rotationRef.current.y);
              }, []);

              const stopInertia = useCallback(() => {
                if (inertiaRAF.current) {
                  cancelAnimationFrame(inertiaRAF.current);
                  inertiaRAF.current = null;
                }
              }, []);

              const startInertia = useCallback(
                (vx, vy) => {
                  const MAX_V = 1.4;
                  let vX = clamp(vx, -MAX_V, MAX_V) * 80;
                  let vY = clamp(vy, -MAX_V, MAX_V) * 80;
                  let frames = 0;
                  const d = clamp(dragDampening ?? 0.6, 0, 1);
                  const frictionMul = 0.94 + 0.055 * d;
                  const stopThreshold = 0.015 - 0.01 * d;
                  const maxFrames = Math.round(90 + 270 * d);
                  const step = () => {
                    vX *= frictionMul;
                    vY *= frictionMul;
                    if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) {
                      inertiaRAF.current = null;
                      return;
                    }
                    if (++frames > maxFrames) {
                      inertiaRAF.current = null;
                      return;
                    }
                    const nextX = clamp(rotationRef.current.x - vY / 200, -maxVerticalRotationDeg, maxVerticalRotationDeg);
                    const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200);
                    rotationRef.current = { x: nextX, y: nextY };
                    applyTransform(nextX, nextY);
                    inertiaRAF.current = requestAnimationFrame(step);
                  };
                  stopInertia();
                  inertiaRAF.current = requestAnimationFrame(step);
                },
                [dragDampening, maxVerticalRotationDeg, stopInertia]
              );

              useGesture(
                {
                  onDragStart: ({ event }) => {
                    if (focusedElRef.current) return;
                    stopInertia();
                    const evt = event;
                    draggingRef.current = true;
                    movedRef.current = false;
                    startRotRef.current = { ...rotationRef.current };
                    startPosRef.current = { x: evt.clientX, y: evt.clientY };
                  },
                  onDrag: ({ event, last, velocity = [0, 0], direction = [0, 0], movement }) => {
                    if (focusedElRef.current || !draggingRef.current || !startPosRef.current) return;
                    const evt = event;
                    const dxTotal = evt.clientX - startPosRef.current.x;
                    const dyTotal = evt.clientY - startPosRef.current.y;
                    if (!movedRef.current) {
                      const dist2 = dxTotal * dxTotal + dyTotal * dyTotal;
                      if (dist2 > 16) movedRef.current = true;
                    }
                    const nextX = clamp(startRotRef.current.x - dyTotal / dragSensitivity, -maxVerticalRotationDeg, maxVerticalRotationDeg);
                    const nextY = wrapAngleSigned(startRotRef.current.y + dxTotal / dragSensitivity);
                    if (rotationRef.current.x !== nextX || rotationRef.current.y !== nextY) {
                      rotationRef.current = { x: nextX, y: nextY };
                      applyTransform(nextX, nextY);
                    }
                    if (last) {
                      draggingRef.current = false;
                      let [vMagX, vMagY] = velocity;
                      const [dirX, dirY] = direction;
                      let vx = vMagX * dirX;
                      let vy = vMagY * dirY;
                      if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
                        const [mx, my] = movement;
                        vx = clamp((mx / dragSensitivity) * 0.02, -1.2, 1.2);
                        vy = clamp((my / dragSensitivity) * 0.02, -1.2, 1.2);
                      }
                      if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy);
                      if (movedRef.current) lastDragEndAt.current = performance.now();
                      movedRef.current = false;
                    }
                  }
                },
                { target: mainRef, eventOptions: { passive: true } }
              );

              useEffect(() => {
                const scrim = scrimRef.current;
                if (!scrim) return;
                const close = () => {
                  if (performance.now() - openStartedAtRef.current < 250) return;
                  const el = focusedElRef.current;
                  if (!el) return;
                  const parent = el.parentElement;
                  const overlay = viewerRef.current?.querySelector('.enlarge');
                  if (!overlay) return;
                  const refDiv = parent.querySelector('.item__image--reference');
                  const originalPos = originalTilePositionRef.current;
                  if (!originalPos) {
                    overlay.remove();
                    if (refDiv) refDiv.remove();
                    parent.style.setProperty('--rot-y-delta', '0deg');
                    parent.style.setProperty('--rot-x-delta', '0deg');
                    el.style.visibility = '';
                    el.style.zIndex = 0;
                    focusedElRef.current = null;
                    rootRef.current?.removeAttribute('data-enlarging');
                    openingRef.current = false;
                    unlockScroll();
                    return;
                  }
                  const currentRect = overlay.getBoundingClientRect();
                  const rootRect = rootRef.current.getBoundingClientRect();
                  const originalPosRelativeToRoot = {
                    left: originalPos.left - rootRect.left,
                    top: originalPos.top - rootRect.top,
                    width: originalPos.width,
                    height: originalPos.height
                  };
                  const overlayRelativeToRoot = {
                    left: currentRect.left - rootRect.left,
                    top: currentRect.top - rootRect.top,
                    width: currentRect.width,
                    height: currentRect.height
                  };
                  const animatingOverlay = document.createElement('div');
                  animatingOverlay.className = 'enlarge-closing';
                  animatingOverlay.style.cssText = `position:absolute;left:${overlayRelativeToRoot.left}px;top:${overlayRelativeToRoot.top}px;width:${overlayRelativeToRoot.width}px;height:${overlayRelativeToRoot.height}px;z-index:9999;border-radius: var(--enlarge-radius, 32px);overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:all ${enlargeTransitionMs}ms ease-out;pointer-events:none;margin:0;transform:none;`;
                  const originalImg = overlay.querySelector('img');
                  if (originalImg) {
                    const img = originalImg.cloneNode();
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    animatingOverlay.appendChild(img);
                  }
                  overlay.remove();
                  rootRef.current.appendChild(animatingOverlay);
                  void animatingOverlay.getBoundingClientRect();
                  requestAnimationFrame(() => {
                    animatingOverlay.style.left = originalPosRelativeToRoot.left + 'px';
                    animatingOverlay.style.top = originalPosRelativeToRoot.top + 'px';
                    animatingOverlay.style.width = originalPosRelativeToRoot.width + 'px';
                    animatingOverlay.style.height = originalPosRelativeToRoot.height + 'px';
                    animatingOverlay.style.opacity = '0';
                  });
                  const cleanup = () => {
                    animatingOverlay.remove();
                    originalTilePositionRef.current = null;
                    if (refDiv) refDiv.remove();
                    parent.style.transition = 'none';
                    el.style.transition = 'none';
                    parent.style.setProperty('--rot-y-delta', '0deg');
                    parent.style.setProperty('--rot-x-delta', '0deg');
                    requestAnimationFrame(() => {
                      el.style.visibility = '';
                      el.style.opacity = '0';
                      el.style.zIndex = 0;
                      focusedElRef.current = null;
                      rootRef.current?.removeAttribute('data-enlarging');
                      requestAnimationFrame(() => {
                        parent.style.transition = '';
                        el.style.transition = 'opacity 300ms ease-out';
                        requestAnimationFrame(() => {
                          el.style.opacity = '1';
                          setTimeout(() => {
                            el.style.transition = '';
                            el.style.opacity = '';
                            openingRef.current = false;
                            if (!draggingRef.current && rootRef.current?.getAttribute('data-enlarging') !== 'true')
                              document.body.classList.remove('dg-scroll-lock');
                          }, 300);
                        });
                      });
                    });
                  };
                  animatingOverlay.addEventListener('transitionend', cleanup, { once: true });
                };
                scrim.addEventListener('click', close);
                const onKey = e => {
                  if (e.key === 'Escape') close();
                };
                window.addEventListener('keydown', onKey);
                return () => {
                  scrim.removeEventListener('click', close);
                  window.removeEventListener('keydown', onKey);
                };
              }, [enlargeTransitionMs, unlockScroll]);

              const openItemFromElement = useCallback(
                el => {
                  if (openingRef.current) return;
                  openingRef.current = true;
                  openStartedAtRef.current = performance.now();
                  lockScroll();
                  const parent = el.parentElement;
                  focusedElRef.current = el;
                  el.setAttribute('data-focused', 'true');
                  const offsetX = getDataNumber(parent, 'offsetX', 0);
                  const offsetY = getDataNumber(parent, 'offsetY', 0);
                  const sizeX = getDataNumber(parent, 'sizeX', 2);
                  const sizeY = getDataNumber(parent, 'sizeY', 2);
                  const parentRot = computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, segments);
                  const parentY = normalizeAngle(parentRot.rotateY);
                  const globalY = normalizeAngle(rotationRef.current.y);
                  let rotY = -(parentY + globalY) % 360;
                  if (rotY < -180) rotY += 360;
                  const rotX = -parentRot.rotateX - rotationRef.current.x;
                  parent.style.setProperty('--rot-y-delta', `${rotY}deg`);
                  parent.style.setProperty('--rot-x-delta', `${rotX}deg`);
                  const refDiv = document.createElement('div');
                  refDiv.className = 'item__image item__image--reference';
                  refDiv.style.opacity = '0';
                  refDiv.style.transform = `rotateX(${-parentRot.rotateX}deg) rotateY(${-parentRot.rotateY}deg)`;
                  parent.appendChild(refDiv);

                  void refDiv.offsetHeight;

                  const tileR = refDiv.getBoundingClientRect();
                  const mainR = mainRef.current?.getBoundingClientRect();
                  const frameR = frameRef.current?.getBoundingClientRect();

                  if (!mainR || !frameR || tileR.width <= 0 || tileR.height <= 0) {
                    openingRef.current = false;
                    focusedElRef.current = null;
                    parent.removeChild(refDiv);
                    unlockScroll();
                    return;
                  }

                  originalTilePositionRef.current = { left: tileR.left, top: tileR.top, width: tileR.width, height: tileR.height };
                  el.style.visibility = 'hidden';
                  el.style.zIndex = 0;
                  const overlay = document.createElement('div');
                  overlay.className = 'enlarge';
                  overlay.style.position = 'absolute';
                  overlay.style.left = frameR.left - mainR.left + 'px';
                  overlay.style.top = frameR.top - mainR.top + 'px';
                  overlay.style.width = frameR.width + 'px';
                  overlay.style.height = frameR.height + 'px';
                  overlay.style.opacity = '0';
                  overlay.style.zIndex = '30';
                  overlay.style.willChange = 'transform, opacity';
                  overlay.style.transformOrigin = 'top left';
                  overlay.style.transition = `transform ${enlargeTransitionMs}ms ease, opacity ${enlargeTransitionMs}ms ease`;
                  const rawSrc = parent.dataset.src || el.querySelector('img')?.src || '';
                  const img = document.createElement('img');
                  img.src = rawSrc;
                  overlay.appendChild(img);
                  viewerRef.current.appendChild(overlay);
                  const tx0 = tileR.left - frameR.left;
                  const ty0 = tileR.top - frameR.top;
                  const sx0 = tileR.width / frameR.width;
                  const sy0 = tileR.height / frameR.height;

                  const validSx0 = isFinite(sx0) && sx0 > 0 ? sx0 : 1;
                  const validSy0 = isFinite(sy0) && sy0 > 0 ? sy0 : 1;

                  overlay.style.transform = `translate(${tx0}px, ${ty0}px) scale(${validSx0}, ${validSy0})`;

                  setTimeout(() => {
                    if (!overlay.parentElement) return;
                    overlay.style.opacity = '1';
                    overlay.style.transform = 'translate(0px, 0px) scale(1, 1)';
                    rootRef.current?.setAttribute('data-enlarging', 'true');
                  }, 16);

                  const wantsResize = openedImageWidth || openedImageHeight;
                  if (wantsResize) {
                    const onFirstEnd = ev => {
                      if (ev.propertyName !== 'transform') return;
                      overlay.removeEventListener('transitionend', onFirstEnd);
                      const prevTransition = overlay.style.transition;
                      overlay.style.transition = 'none';
                      const tempWidth = openedImageWidth || `${frameR.width}px`;
                      const tempHeight = openedImageHeight || `${frameR.height}px`;
                      overlay.style.width = tempWidth;
                      overlay.style.height = tempHeight;
                      const newRect = overlay.getBoundingClientRect();
                      overlay.style.width = frameR.width + 'px';
                      overlay.style.height = frameR.height + 'px';
                      void overlay.offsetWidth;
                      overlay.style.transition = `left ${enlargeTransitionMs}ms ease, top ${enlargeTransitionMs}ms ease, width ${enlargeTransitionMs}ms ease, height ${enlargeTransitionMs}ms ease`;
                      const centeredLeft = frameR.left - mainR.left + (frameR.width - newRect.width) / 2;
                      const centeredTop = frameR.top - mainR.top + (frameR.height - newRect.height) / 2;
                      requestAnimationFrame(() => {
                        overlay.style.left = `${centeredLeft}px`;
                        overlay.style.top = `${centeredTop}px`;
                        overlay.style.width = tempWidth;
                        overlay.style.height = tempHeight;
                      });
                      const cleanupSecond = () => {
                        overlay.removeEventListener('transitionend', cleanupSecond);
                        overlay.style.transition = prevTransition;
                      };
                      overlay.addEventListener('transitionend', cleanupSecond, { once: true });
                    };
                    overlay.addEventListener('transitionend', onFirstEnd);
                  }
                },
                [enlargeTransitionMs, lockScroll, openedImageHeight, openedImageWidth, segments, unlockScroll]
              );

              const onTileClick = useCallback(
                e => {
                  if (draggingRef.current) return;
                  if (movedRef.current) return;
                  if (performance.now() - lastDragEndAt.current < 80) return;
                  if (openingRef.current) return;
                  openItemFromElement(e.currentTarget);
                },
                [openItemFromElement]
              );

              const onTilePointerUp = useCallback(
                e => {
                  if (e.pointerType !== 'touch') return;
                  if (draggingRef.current) return;
                  if (movedRef.current) return;
                  if (performance.now() - lastDragEndAt.current < 80) return;
                  if (openingRef.current) return;
                  openItemFromElement(e.currentTarget);
                },
                [openItemFromElement]
              );

              useEffect(() => {
                return () => {
                  document.body.classList.remove('dg-scroll-lock');
                };
              }, []);

              return (
                <div
                  ref={rootRef}
                  className="sphere-root"
                  style={{
                    ['--segments-x']: segments,
                    ['--segments-y']: segments,
                    ['--overlay-blur-color']: overlayBlurColor,
                    ['--tile-radius']: imageBorderRadius,
                    ['--enlarge-radius']: openedImageBorderRadius,
                    ['--image-filter']: grayscale ? 'grayscale(1)' : 'none'
                  }}
                >
                  <main ref={mainRef} className="sphere-main">
                    <div className="stage">
                      <div ref={sphereRef} className="sphere">
                        {items.map((it, i) => (
                          <div
                            key={`${it.x},${it.y},${i}`}
                            className="item"
                            data-src={it.src}
                            data-offset-x={it.x}
                            data-offset-y={it.y}
                            data-size-x={it.sizeX}
                            data-size-y={it.sizeY}
                            style={{
                              ['--offset-x']: it.x,
                              ['--offset-y']: it.y,
                              ['--item-size-x']: it.sizeX,
                              ['--item-size-y']: it.sizeY
                            }}
                          >
                            <div
                              className="item__image"
                              role="button"
                              tabIndex={0}
                              aria-label={it.alt || 'Open image'}
                              onClick={onTileClick}
                              onPointerUp={onTilePointerUp}
                            >
                              <img src={it.src} draggable={false} alt={it.alt} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="overlay" />
                    <div className="overlay overlay--blur" />
                    <div className="edge-fade edge-fade--top" />
                    <div className="edge-fade edge-fade--bottom" />

                    <div className="viewer" ref={viewerRef}>
                      <div ref={scrimRef} className="scrim" />
                      <div ref={frameRef} className="frame" />
                    </div>
                  </main>
                </div>
              );
            }


            // ==========================================
            // CircularGallery Implementation
            // ==========================================
            function debounce(func, wait) {
              let timeout;
              return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
              };
            }

            function lerp(p1, p2, t) {
              return p1 + (p2 - p1) * t;
            }

            function autoBind(instance) {
              const proto = Object.getPrototypeOf(instance);
              Object.getOwnPropertyNames(proto).forEach(key => {
                if (key !== 'constructor' && typeof instance[key] === 'function') {
                  instance[key] = instance[key].bind(instance);
                }
              });
            }

            function getFontSize(font) {
              const match = font.match(/(\d+)px/);
              return match ? parseInt(match[1], 10) : 30;
            }

            function createTextTexture(gl, text, font = 'bold 30px monospace', color = 'black') {
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              context.font = font;
              const metrics = context.measureText(text);
              const textWidth = Math.ceil(metrics.width);
              const textHeight = Math.ceil(getFontSize(font) * 1.2);
              canvas.width = textWidth + 20;
              canvas.height = textHeight + 20;
              context.font = font;
              context.fillStyle = color;
              context.textBaseline = 'middle';
              context.textAlign = 'center';
              context.clearRect(0, 0, canvas.width, canvas.height);
              context.fillText(text, canvas.width / 2, canvas.height / 2);
              const texture = new Texture(gl, { generateMipmaps: false });
              texture.image = canvas;
              return { texture, width: canvas.width, height: canvas.height };
            }

            class Title {
              constructor({ gl, plane, renderer, text, textColor = '#545050', font = '30px sans-serif' }) {
                autoBind(this);
                this.gl = gl;
                this.plane = plane;
                this.renderer = renderer;
                this.text = text;
                this.textColor = textColor;
                this.font = font;
                this.createMesh();
              }
              createMesh() {
                const { texture, width, height } = createTextTexture(this.gl, this.text, this.font, this.textColor);
                const geometry = new Plane(this.gl);
                const program = new Program(this.gl, {
                  vertex: `
                    attribute vec3 position;
                    attribute vec2 uv;
                    uniform mat4 modelViewMatrix;
                    uniform mat4 projectionMatrix;
                    varying vec2 vUv;
                    void main() {
                      vUv = uv;
                      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                  `,
                  fragment: `
                    precision highp float;
                    uniform sampler2D tMap;
                    varying vec2 vUv;
                    void main() {
                      vec4 color = texture2D(tMap, vUv);
                      if (color.a < 0.1) discard;
                      gl_FragColor = color;
                    }
                  `,
                  uniforms: { tMap: { value: texture } },
                  transparent: true
                });
                this.mesh = new Mesh(this.gl, { geometry, program });
                const aspect = width / height;
                const textHeight = this.plane.scale.y * 0.15;
                const textWidth = textHeight * aspect;
                this.mesh.scale.set(textWidth, textHeight, 1);
                this.mesh.position.y = -this.plane.scale.y * 0.5 - textHeight * 0.5 - 0.05;
                this.mesh.setParent(this.plane);
              }
            }

            class Media {
              constructor({ geometry, gl, image, index, length, renderer, scene, screen, text, viewport, bend, textColor, borderRadius = 0, font }) {
                this.extra = 0;
                this.geometry = geometry;
                this.gl = gl;
                this.image = image;
                this.index = index;
                this.length = length;
                this.renderer = renderer;
                this.scene = scene;
                this.screen = screen;
                this.text = text;
                this.viewport = viewport;
                this.bend = bend;
                this.textColor = textColor;
                this.borderRadius = borderRadius;
                this.font = font;
                this.createShader();
                this.createMesh();
                this.createTitle();
                this.onResize();
              }
              createShader() {
                const texture = new Texture(this.gl, { generateMipmaps: true });
                this.program = new Program(this.gl, {
                  depthTest: false,
                  depthWrite: false,
                  vertex: `
                    precision highp float;
                    attribute vec3 position;
                    attribute vec2 uv;
                    uniform mat4 modelViewMatrix;
                    uniform mat4 projectionMatrix;
                    uniform float uTime;
                    uniform float uSpeed;
                    varying vec2 vUv;
                    void main() {
                      vUv = uv;
                      vec3 p = position;
                      p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.1 + uSpeed * 0.5);
                      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                    }
                  `,
                  fragment: `
                    precision highp float;
                    uniform vec2 uImageSizes;
                    uniform vec2 uPlaneSizes;
                    uniform sampler2D tMap;
                    uniform float uBorderRadius;
                    varying vec2 vUv;
                    
                    float roundedBoxSDF(vec2 p, vec2 b, float r) {
                      vec2 d = abs(p) - b;
                      return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
                    }
                    
                    void main() {
                      vec2 ratio = vec2(
                        min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
                        min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
                      );
                      vec2 uv = vec2(
                        vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
                        vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
                      );
                      vec4 color = texture2D(tMap, uv);
                      
                      float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
                      float edgeSmooth = 0.002;
                      float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);
                      
                      gl_FragColor = vec4(color.rgb, alpha);
                    }
                  `,
                  uniforms: {
                    tMap: { value: texture },
                    uPlaneSizes: { value: [0, 0] },
                    uImageSizes: { value: [0, 0] },
                    uSpeed: { value: 0 },
                    uTime: { value: 100 * Math.random() },
                    uBorderRadius: { value: this.borderRadius }
                  },
                  transparent: true
                });
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = this.image;
                img.onload = () => {
                  texture.image = img;
                  this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
                };
              }
              createMesh() {
                this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
                this.plane.setParent(this.scene);
              }
              createTitle() {
                this.title = new Title({ gl: this.gl, plane: this.plane, renderer: this.renderer, text: this.text, textColor: this.textColor, font: this.font });
              }
              update(scroll, direction) {
                this.plane.position.x = this.x - scroll.current - this.extra;
                const x = this.plane.position.x;
                const H = this.viewport.width / 2;
                if (this.bend === 0) {
                  this.plane.position.y = 0;
                  this.plane.rotation.z = 0;
                } else {
                  const B_abs = Math.abs(this.bend);
                  const R = (H * H + B_abs * B_abs) / (2 * B_abs);
                  const effectiveX = Math.min(Math.abs(x), H);
                  const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);
                  if (this.bend > 0) {
                    this.plane.position.y = -arc;
                    this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
                  } else {
                    this.plane.position.y = arc;
                    this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
                  }
                }
                this.speed = scroll.current - scroll.last;
                this.program.uniforms.uTime.value += 0.04;
                this.program.uniforms.uSpeed.value = this.speed;
                const planeOffset = this.plane.scale.x / 2;
                const viewportOffset = this.viewport.width / 2;
                this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
                this.isAfter = this.plane.position.x - planeOffset > viewportOffset;
                if (direction === 'right' && this.isBefore) {
                  this.extra -= this.widthTotal;
                  this.isBefore = this.isAfter = false;
                }
                if (direction === 'left' && this.isAfter) {
                  this.extra += this.widthTotal;
                  this.isBefore = this.isAfter = false;
                }
              }
              onResize({ screen, viewport } = {}) {
                if (screen) this.screen = screen;
                if (viewport) {
                  this.viewport = viewport;
                  if (this.plane.program.uniforms.uViewportSizes) {
                    this.plane.program.uniforms.uViewportSizes.value = [this.viewport.width, this.viewport.height];
                  }
                }
                this.scale = this.screen.height / 1500;
                this.plane.scale.y = (this.viewport.height * (900 * this.scale)) / this.screen.height;
                this.plane.scale.x = (this.viewport.width * (700 * this.scale)) / this.screen.width;
                this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
                this.padding = 2;
                this.width = this.plane.scale.x + this.padding;
                this.widthTotal = this.width * this.length;
                this.x = this.width * this.index;
              }
            }

            class WebGLApp {
              constructor(container, { items, bend, textColor = '#ffffff', borderRadius = 0, font = 'bold 30px Figtree', scrollSpeed = 2, scrollEase = 0.05 } = {}) {
                this.container = container;
                this.scrollSpeed = scrollSpeed;
                this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
                this.onCheckDebounce = debounce(this.onCheck.bind(this), 200);
                this.createRenderer();
                this.createCamera();
                this.createScene();
                this.onResize();
                this.createGeometry();
                this.createMedias(items, bend, textColor, borderRadius, font);
                this.update();
                this.addEventListeners();
              }
              createRenderer() {
                this.renderer = new Renderer({ alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
                this.gl = this.renderer.gl;
                this.gl.clearColor(0, 0, 0, 0);
                this.gl.canvas.style.background = 'transparent';
                this.container.appendChild(this.gl.canvas);
              }
              createCamera() {
                this.camera = new Camera(this.gl);
                this.camera.fov = 45;
                this.camera.position.z = 20;
              }
              createScene() {
                this.scene = new Transform();
              }
              createGeometry() {
                this.planeGeometry = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 });
              }
              createMedias(items, bend = 1, textColor, borderRadius, font) {
                const defaultItems = [ { image: "./images/ani me.png", text: "Anime" } ];
                const galleryItems = items && items.length ? items : defaultItems;
                this.mediasImages = galleryItems.concat(galleryItems);
                this.medias = this.mediasImages.map((data, index) => {
                  return new Media({
                    geometry: this.planeGeometry,
                    gl: this.gl,
                    image: data.image,
                    index,
                    length: this.mediasImages.length,
                    renderer: this.renderer,
                    scene: this.scene,
                    screen: this.screen,
                    text: data.text,
                    viewport: this.viewport,
                    bend,
                    textColor,
                    borderRadius,
                    font
                  });
                });
              }
              update() {
                if(!this.gl) return;
                this.raf = requestAnimationFrame(this.update.bind(this));
                this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
                const direction = this.scroll.current > this.scroll.last ? 'left' : 'right';
                if (this.medias) {
                  this.medias.forEach(media => media.update(this.scroll, direction));
                }
                this.renderer.render({ scene: this.scene, camera: this.camera });
                this.scroll.last = this.scroll.current;
              }
              onResize() {
                this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
                this.renderer.setSize(this.screen.width, this.screen.height);
                this.camera.perspective({ aspect: this.screen.width / this.screen.height });
                const fov = this.camera.fov * (Math.PI / 180);
                const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
                const width = height * this.camera.aspect;
                this.viewport = { width, height };
                if (this.medias) {
                  this.medias.forEach(media => media.onResize({ screen: this.screen, viewport: this.viewport }));
                }
              }
              addEventListeners() {
                window.addEventListener('resize', this.onCheckDebounce);
                let isDown = false;
                let startY = 0;
                this.wheelHandler = e => { this.scroll.target += e.deltaY * this.scrollSpeed * 0.02; };
                this.downHandler = e => { isDown = true; startY = e.clientY; };
                this.moveHandler = e => {
                    if (!isDown) return;
                    const y = e.clientY;
                    this.scroll.target += (startY - y) * this.scrollSpeed * 0.05;
                    startY = y;
                };
                this.upHandler = () => { isDown = false; };
                this.touchDownHandler = e => { isDown = true; startY = e.touches[0].clientY; };
                this.touchMoveHandler = e => {
                    if (!isDown) return;
                    const y = e.touches[0].clientY;
                    this.scroll.target += (startY - y) * this.scrollSpeed * 0.05;
                    startY = y;
                };
                this.touchUpHandler = () => { isDown = false; };

                this.container.addEventListener('wheel', this.wheelHandler, { passive: true });
                this.container.addEventListener('mousedown', this.downHandler);
                window.addEventListener('mousemove', this.moveHandler);
                window.addEventListener('mouseup', this.upHandler);
                this.container.addEventListener('touchstart', this.touchDownHandler, { passive: true });
                window.addEventListener('touchmove', this.touchMoveHandler, { passive: true });
                window.addEventListener('touchend', this.touchUpHandler);
              }
              onCheck() {
                this.onResize();
              }
              destroy() {
                cancelAnimationFrame(this.raf);
                window.removeEventListener('resize', this.onCheckDebounce);
                window.removeEventListener('mousemove', this.moveHandler);
                window.removeEventListener('mouseup', this.upHandler);
                window.removeEventListener('touchmove', this.touchMoveHandler);
                window.removeEventListener('touchend', this.touchUpHandler);
                if(this.renderer && this.renderer.gl && this.renderer.gl.canvas) {
                    this.container.removeChild(this.renderer.gl.canvas);
                }
              }
            }

            const CircularGallery = ({ items, bend=3, textColor="#ffffff", borderRadius=0.05, font="bold 30px Orbitron", scrollSpeed=2, scrollEase=0.05 }) => {
              const containerRef = useRef(null);
              useEffect(() => {
                if (containerRef.current) {
                  const app = new WebGLApp(containerRef.current, { items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase });
                  return () => {
                    app.destroy();
                  }
                }
              }, [items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase]);

              return <div ref={containerRef} className="circular-gallery" />;
            };


            // ==========================================
            // Main Portfolio Code
            // ==========================================
            const PANEL_COUNT = 22;
            const WAVE_SPRING = { stiffness: 120, damping: 18, mass: 0.5 };
            const SCENE_SPRING = { stiffness: 60, damping: 18, mass: 1 };
            const Z_SPREAD = 42;
            const SIGMA = 2.5;

            const PANEL_IMAGES = [
                "./images/3 sweety.png",
                "./images/ani me.png",
                "./images/boss.png",
                "./images/cheery.png",
                "./images/coffee.png",
                "./images/college correct.png",
                "./images/college.png",
                "./images/hand boss.png"
            ];

            const GRADIENT_OVERLAYS = [
                "linear-gradient(135deg, rgba(99,55,255,0.55) 0%, rgba(236,72,153,0.45) 100%)",
                "linear-gradient(135deg, rgba(6,182,212,0.55) 0%, rgba(59,130,246,0.45) 100%)",
                "linear-gradient(135deg, rgba(245,158,11,0.55) 0%, rgba(239,68,68,0.45) 100%)",
                "linear-gradient(135deg, rgba(16,185,129,0.45) 0%, rgba(6,182,212,0.55) 100%)",
            ];

            function Panel({ index, total, waveY, scaleY }) {
                const t = index / (total - 1);
                const baseZ = (index - (total - 1)) * Z_SPREAD;
                const w = 200 + t * 80;
                const h = 280 + t * 120;
                const opacity = 0.25 + t * 0.75;
                const imageUrl = PANEL_IMAGES[index % PANEL_IMAGES.length];
                const gradient = GRADIENT_OVERLAYS[index % GRADIENT_OVERLAYS.length];

                return (
                    <motion.div
                        className="absolute rounded-xl pointer-events-none overflow-hidden"
                        style={{
                            width: w,
                            height: h,
                            marginLeft: -w / 2,
                            marginTop: -h / 2,
                            transform: `translateZ(${baseZ}px)`,
                            y: waveY,
                            scaleY,
                            transformOrigin: "bottom center",
                            opacity,
                        }}
                    >
                        <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${imageUrl}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                        <div style={{ position: "absolute", inset: 0, background: gradient, mixBlendMode: "multiply" }} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.32) 100%)" }} />
                        <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", border: `1px solid rgba(255,255,255,${0.08 + t * 0.22})`, boxSizing: "border-box" }} />
                    </motion.div>
                );
            }

            function StackedPanels() {
                const containerRef = useRef(null);
                const isHovering = useRef(false);

                const waveYSprings = Array.from({ length: PANEL_COUNT }, () => useSpring(0, WAVE_SPRING));
                const scaleYSprings = Array.from({ length: PANEL_COUNT }, () => useSpring(1, WAVE_SPRING));
                const rotY = useSpring(15, SCENE_SPRING);
                const rotX = useSpring(5, SCENE_SPRING);

                const handleMouseMove = useCallback((e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    isHovering.current = true;

                    const cx = (e.clientX - rect.left) / rect.width;
                    const cy = (e.clientY - rect.top) / rect.height;

                    rotY.set(15 + (cx - 0.5) * 24);
                    rotX.set(5 + (cy - 0.5) * -15);

                    const cursorCardPos = cx * (PANEL_COUNT - 1);

                    waveYSprings.forEach((spring, i) => {
                        const dist = Math.abs(i - cursorCardPos);
                        const influence = Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA));
                        spring.set(-influence * 70);
                    });

                    scaleYSprings.forEach((spring, i) => {
                        const dist = Math.abs(i - cursorCardPos);
                        const influence = Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA));
                        spring.set(0.35 + influence * 0.65);
                    });
                }, [rotY, rotX, waveYSprings, scaleYSprings]);

                const handleMouseLeave = useCallback(() => {
                    isHovering.current = false;
                    rotY.set(15);
                    rotX.set(5);
                    waveYSprings.forEach(s => s.set(0));
                    scaleYSprings.forEach(s => s.set(1));
                }, [rotY, rotX, waveYSprings, scaleYSprings]);

                return (
                    <div
                        ref={containerRef}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        className="relative w-full h-[700px] flex items-center justify-start pl-8 select-none"
                        style={{ perspective: "1000px" }}
                    >
                        <motion.div style={{ rotateY: rotY, rotateX: rotX, transformStyle: "preserve-3d", position: "relative", width: 0, height: 0 }}>
                            {Array.from({ length: PANEL_COUNT }).map((_, i) => (
                                <Panel key={i} index={i} total={PANEL_COUNT} waveY={waveYSprings[i]} scaleY={scaleYSprings[i]} />
                            ))}
                        </motion.div>
                    </div>
                );
            }

            const DecryptText = ({ text }) => {
                const elRef = useRef(null);
                
                useEffect(() => {
                    const observer = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting && elRef.current) {
                            const b = baffle(elRef.current, {
                                characters: '█▓▒░<>//}{[]~^10',
                                speed: 80
                            });
                            b.start();
                            b.reveal(2500);
                            observer.disconnect();
                        }
                    }, { threshold: 0.1 });
                    
                    if (elRef.current) observer.observe(elRef.current);
                    return () => observer.disconnect();
                }, []);

                return <span ref={elRef}>{text}</span>;
            }

            function ContactCard() {
                const cardRef = useRef(null);
                const rotX = useSpring(0, { stiffness: 100, damping: 20 });
                const rotY = useSpring(0, { stiffness: 100, damping: 20 });

                const handleMouseMove = (e) => {
                    if (!cardRef.current) return;
                    const rect = cardRef.current.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    rotX.set(-(y / rect.height) * 40);
                    rotY.set((x / rect.width) * 40);
                };

                const handleMouseLeave = () => {
                    rotX.set(0);
                    rotY.set(0);
                };

                return (
                    <div 
                        ref={cardRef}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        style={{ perspective: 1200 }}
                        className="w-full max-w-lg mx-auto h-[350px] mt-12 cursor-crosshair z-20 relative"
                    >
                        <motion.div 
                            style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
                            className="w-full h-full liquid-glass-strong rounded-[2.5rem] p-10 flex flex-col justify-center items-center text-center relative border border-white/10 card-3d-hover"
                        >
                            <div style={{ transform: "translateZ(80px)" }} className="z-10">
                                <h3 className="text-4xl font-heading italic text-white mb-2 tracking-tight pointer-events-none text-shimmer">Initialize Link</h3>
                                <a href="mailto:muhammad.muneeb.nif@gmail.com" className="block text-white/60 hover:text-white transition-colors mb-8 font-inter text-sm uppercase tracking-widest pointer-events-auto">muhammad.muneeb.nif@gmail.com</a>
                            </div>
                            <div style={{ transform: "translateZ(100px)" }} className="flex gap-6 z-20">
                                <a href="#" className="liquid-glass text-white px-8 py-3 rounded-full font-bold hover:bg-white hover:text-black transition-all shadow-xl shadow-black/50 pointer-events-auto hover:scale-105 hover:shadow-purple-500/20">GitHub</a>
                                <a href="#" className="bg-[#00ff41]/90 text-black px-8 py-3 rounded-full font-bold hover:bg-[#00ff41] hover:scale-105 transition-transform shadow-xl shadow-[#00ff41]/20 pointer-events-auto">LinkedIn</a>
                            </div>
                            <div style={{ transform: "translateZ(-40px)" }} className="absolute -top-10 -right-10 w-32 h-32 bg-[#8b5ad5]/30 rounded-full blur-2xl pointer-events-none animate-glow-pulse"></div>
                            <div style={{ transform: "translateZ(20px)" }} className="absolute -bottom-10 -left-10 w-32 h-32 bg-[#00ff41]/20 rounded-full blur-2xl pointer-events-none animate-green-glow"></div>
                            <div style={{ transform: "translateZ(40px)" }} className="absolute inset-0 border border-white/5 rounded-[2.5rem] pointer-events-none animate-border-glow"></div>
                        </motion.div>
                    </div>
                );
            }

            // ==========================================
            // AnimatedSection — scroll-triggered reveal
            // ==========================================
            const fadeUp = {
                hidden: { opacity: 0, y: 60, filter: 'blur(8px)', scale: 0.97 },
                visible: (i = 0) => ({
                    opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
                    transition: { duration: 1, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }
                })
            };
            const fadeLeft = {
                hidden: { opacity: 0, x: -80, rotateY: 8 },
                visible: (i = 0) => ({
                    opacity: 1, x: 0, rotateY: 0,
                    transition: { duration: 0.9, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }
                })
            };
            const fadeRight = {
                hidden: { opacity: 0, x: 80, rotateY: -8 },
                visible: (i = 0) => ({
                    opacity: 1, x: 0, rotateY: 0,
                    transition: { duration: 0.9, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }
                })
            };
            const scaleReveal = {
                hidden: { opacity: 0, scale: 0.8, rotateX: 10 },
                visible: (i = 0) => ({
                    opacity: 1, scale: 1, rotateX: 0,
                    transition: { duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }
                })
            };

            function AnimatedSection({ children, variant = 'fadeUp', delay = 0, className = '', style = {} }) {
                const ref = useRef(null);
                const isInView = useInView(ref, { once: true, margin: '-80px' });
                const variants = { fadeUp, fadeLeft, fadeRight, scaleReveal };
                const v = variants[variant] || fadeUp;
                return (
                    <motion.div ref={ref} initial="hidden" animate={isInView ? 'visible' : 'hidden'} custom={delay} variants={v} className={className} style={{ transformStyle: 'preserve-3d', ...style }}>
                        {children}
                    </motion.div>
                );
            }

            function App() {
                const [isAudioPlaying, setIsAudioPlaying] = useState(false);
                const [activeBioTab, setActiveBioTab] = useState('about');
                const audioRef = useRef(null);
                const toggleAudio = () => {
                    if (audioRef.current) {
                        if (isAudioPlaying) {
                            audioRef.current.pause();
                            setIsAudioPlaying(false);
                        } else {
                            audioRef.current.play().catch(e => console.log("Audio play failed:", e));
                            setIsAudioPlaying(true);
                        }
                    }
                };

                const startJourney = () => {
                    document.getElementById('about').scrollIntoView({behavior: 'smooth'});
                    if (audioRef.current && !isAudioPlaying) {
                        audioRef.current.play().then(() => {
                            setIsAudioPlaying(true);
                        }).catch(e => console.log("Audio play failed:", e));
                    }
                };

                useEffect(() => {
                    let listenersAttached = false;

                    const removeListeners = () => {
                        if (!listenersAttached) return;
                        listenersAttached = false;
                        window.removeEventListener('click', startAudio);
                        window.removeEventListener('touchstart', startAudio);
                        window.removeEventListener('scroll', startAudio);
                        window.removeEventListener('mousemove', startAudio);
                        window.removeEventListener('keydown', startAudio);
                    };

                    const startAudio = () => {
                        if (audioRef.current) {
                            audioRef.current.play()
                                .then(() => {
                                    setIsAudioPlaying(true);
                                    removeListeners();
                                })
                                .catch(() => {
                                    // Autoplay blocked, wait for next interaction
                                });
                        }
                    };

                    // Try immediate play
                    startAudio();

                    // If blocked, listen for first user interaction
                    listenersAttached = true;
                    window.addEventListener('click', startAudio);
                    window.addEventListener('touchstart', startAudio);
                    window.addEventListener('scroll', startAudio, { passive: true });
                    window.addEventListener('mousemove', startAudio);
                    window.addEventListener('keydown', startAudio);

                    return () => {
                        removeListeners();
                    };
                }, []);

                useEffect(() => {
                    let vantaEffect;
                    if (window.VANTA && window.VANTA.NET) {
                        vantaEffect = window.VANTA.NET({
                            el: "#vanta-bg",
                            mouseControls: true,
                            touchControls: true,
                            gyroControls: false,
                            minHeight: 200.00,
                            minWidth: 200.00,
                            scale: 1.00,
                            scaleMobile: 1.00,
                            color: 0x8b5ad5,
                            backgroundColor: 0x050510,
                            points: 12.00,
                            maxDistance: 22.00,
                            spacing: 16.00
                        });
                    }
                    return () => {
                        if (vantaEffect) vantaEffect.destroy();
                    };
                }, []);

                const galleryItems = [
                  { image: "./images/ani me.png", text: "Anime" },
                  { image: "./images/boss.png", text: "Boss" },
                  { image: "./images/cheery.png", text: "Cheery" },
                  { image: "./images/coffee.png", text: "Coffee" },
                  { image: "./images/college correct.png", text: "College" },
                  { image: "./images/hand boss.png", text: "Hand" },
                  { image: "./images/mafia.png", text: "Mafia" },
                  { image: "./images/mirror.png", text: "Mirror" },
                  { image: "./images/multi.png", text: "Multi" },
                  { image: "./images/personal.png", text: "Personal" },
                  { image: "./images/sigma.png", text: "Sigma" },
                  { image: "./images/simple.png", text: "Simple" }
                ];

                const domeImages = [
                  "./images/3 sweety.png",
                  "./images/swap.png",
                  "./images/reject.png",
                  "./images/ani me.png",
                  "./images/boss.png",
                  "./images/cheery.png"
                ];

                return (
                    <div className="min-h-screen bg-background text-foreground relative selection:bg-[#00ff41] selection:text-black">
                        
                        <audio ref={audioRef} loop src="https://archive.org/download/asha-bhosle-abhi-na-jaao-chhod-kar/Asha%20Bhosle%20-%20Abhi%20Na%20Jaao%20Chhod%20Kar.mp3" preload="auto"></audio>
                        
                        <button 
                            onClick={toggleAudio}
                            className="fixed bottom-8 right-8 z-50 liquid-glass-strong rounded-full w-14 h-14 flex items-center justify-center hover:scale-110 transition-transform text-[#00ff41]"
                            title="♫ Abhi Na Jaao Chhod Kar — Asha Bhosle &amp; Mohammed Rafi"
                        >
                            {isAudioPlaying ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                            )}
                        </button>

                        <nav className="fixed top-6 left-0 right-0 z-50 px-8 flex justify-center">
                            <div className="liquid-glass rounded-full px-6 py-2.5 flex items-center justify-between gap-8 md:gap-12 backdrop-blur-xl">
                                <span className="font-heading italic text-2xl tracking-tight">Muneeb.</span>
                                <div className="hidden md:flex gap-8 text-sm font-medium text-white/70 font-inter">
                                     <a href="#about" className="hover:text-white transition-colors">Duality</a>
                                     <a href="#skills" className="hover:text-white transition-colors">Polyglot Hub</a>
                                     <a href="#timeline" className="hover:text-white transition-colors">Education Stream</a>
                                     <a href="#chronicle" className="hover:text-white transition-colors">Chronicle</a>
                                     <a href="#contact" className="hover:text-white transition-colors">Contact</a>
                                 </div>
                                <button className="bg-white text-black hover:scale-105 transition-transform rounded-full px-5 py-2 text-sm font-medium ml-4" onClick={startJourney}>
                                    Begin Journey
                                </button>
                            </div>
                        </nav>

                        <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
                            <div id="vanta-bg"></div>
                            {/* Enhanced hero background layers */}
                            <Starfield count={120} className="z-[1]" />
                            <AuroraBackground colors={['#8b5ad5', '#00ff41', '#ec4899', '#06b6d4']} />
                            <NeonGrid color="#8b5ad5" className="z-[2]" />
                            
                            <div className="z-10 text-center px-6 max-w-5xl flex flex-col items-center gap-6 pt-20">
                                <motion.div 
                                    initial={{ opacity: 0, y: 30, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="liquid-glass rounded-full px-5 py-1.5 flex items-center gap-3 animate-float-tilt"
                                >
                                    <span className="bg-white text-black px-2 py-0.5 rounded-full text-xs font-bold animate-green-glow">NEW</span>
                                    <span className="text-sm font-medium text-white/90">Bridging Shajowal to the Future</span>
                                </motion.div>
                                
                                <motion.h1 
                                    initial={{ opacity: 0, filter: "blur(20px)", y: 30 }}
                                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                                    transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-6xl sm:text-8xl md:text-[8rem] font-heading italic tracking-[-3px] leading-[0.85] text-shimmer"
                                >
                                    Engineering the <br/>
                                    <span className="text-white/80">Impossible.</span>
                                </motion.h1>

                                <motion.p 
                                    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    transition={{ duration: 1.2, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-base sm:text-lg text-white/70 font-light max-w-3xl mt-4 font-inter leading-relaxed"
                                >
                                    Muhammad Muneeb Shahid. 15-year-old dreamer. Building a machine that can imagine. A journey from village roots to global AI mastery.
                                </motion.p>
                                
                                <motion.button 
                                    initial={{ opacity: 0, scale: 0.85, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ duration: 1, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
                                    whileHover={{ scale: 1.08, boxShadow: '0 0 30px rgba(139,90,213,0.3)' }}
                                    whileTap={{ scale: 0.95 }}
                                    className="liquid-glass-strong rounded-full px-8 py-3 text-sm font-medium mt-8 hover:scale-105 transition-transform animate-glow-pulse"
                                    onClick={startJourney}
                                >
                                    Discover the Duality
                                </motion.button>
                            </div>

                            {/* Scroll indicator */}
                            <motion.div 
                                className="absolute bottom-10 z-10 flex flex-col items-center gap-2"
                                animate={{ y: [0, 12, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                <span className="text-white/30 text-xs font-mono tracking-widest uppercase">Scroll</span>
                                <div className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center p-1">
                                    <motion.div 
                                        className="w-1 h-2 rounded-full bg-[#8b5ad5]"
                                        animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    />
                                </div>
                            </motion.div>
                        </section>

                        <section id="about" className="relative min-h-screen py-32 px-8 lg:px-24 border-t-2 border-white/10 flex flex-col justify-center overflow-hidden">
                            <div className="matrix-container">
                                <div className="matrix-pattern">
                                    {Array.from({ length: 45 }).map((_, i) => (
                                        <div key={i} className="matrix-column" style={{ 
                                            animationDelay: `-${Math.random() * 5}s`,
                                            animationDuration: `${2.5 + Math.random() * 3}s`
                                        }}></div>
                                    ))}
                                </div>
                            </div>
                            {/* Animated background layers */}
                            <FloatingParticles count={40} color="#8b5ad5" speed={0.2} connectDistance={100} />
                            <GradientOrbs />

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center z-10 max-w-7xl mx-auto w-full">
                                <AnimatedSection variant="fadeLeft" delay={0.2} className="flex justify-center relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/20 to-[#00ff41]/10 rounded-[3rem] blur-3xl animate-glow-pulse"></div>
                                    <div className="flex flex-col items-center relative animate-float-tilt">
                                        <div className="w-72 h-[22rem] rounded-[2.5rem] p-3 liquid-glass relative mb-6 card-3d-hover animate-border-glow">
                                             <div className="w-full h-full rounded-[2rem] bg-black border border-white/10 overflow-hidden relative group">
                                                <div className="absolute inset-0 bg-[url('./images/personal.png')] bg-cover bg-center group-hover:scale-110 transition-transform duration-1000 ease-out"></div>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                                                {/* Shimmer overlay on hover */}
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                             </div>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="font-heading italic text-5xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] text-shimmer">Muneeb</h3>
                                            <p className="text-xs tracking-[0.3em] uppercase text-[#00ff41] mt-3 drop-shadow-[0_0_10px_rgba(0,255,65,0.8)] animate-green-glow px-4 py-1 rounded-full border border-[#00ff41]/20">Human / Architect</p>
                                        </div>
                                    </div>
                                </AnimatedSection>
                                <AnimatedSection variant="fadeRight" delay={0.4} className="flex flex-col gap-12 relative">
                                    <div className="flex flex-wrap justify-between items-center gap-6">
                                        <div className="flex justify-center lg:justify-start">
                                            <div className="pyramid-loader scale-75">
                                                <div className="wrapper">
                                                    <span className="side side1"></span>
                                                    <span className="side side2"></span>
                                                    <span className="side side3"></span>
                                                    <span className="side side4"></span>
                                                    <span className="shadow"></span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                                            {[
                                                { id: 'about', label: '01 / IDENTITY' },
                                                { id: 'goals', label: '02 / VISION' },
                                                { id: 'math', label: '03 / SANCTUARY' },
                                                { id: 'japan', label: '04 / HORIZON' }
                                            ].map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveBioTab(tab.id)}
                                                    className={`px-4 py-2 rounded-full text-[10px] font-mono tracking-wider uppercase transition-all duration-300 border ${
                                                        activeBioTab === tab.id
                                                            ? 'bg-[#00ff41]/15 border-[#00ff41] text-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.3)]'
                                                            : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                                                    }`}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="liquid-glass p-8 md:p-12 rounded-[2rem] min-h-[350px] flex flex-col justify-center transition-all duration-300">
                                        <h2 className="text-xs tracking-[0.25em] text-[#00ff41]/80 mb-6 uppercase font-bold font-mono">
                                            System Narrative // {activeBioTab.toUpperCase()} // Decrypting...
                                        </h2>
                                        <p className="text-xl md:text-2xl font-heading italic leading-relaxed text-white/90">
                                            {activeBioTab === 'about' && (
                                                <DecryptText key="about" text="I am Muhammad Muneeb Shahid, a 15-year-old tech enthusiast and visionary creator. I have recently completed my matriculation and am currently awaiting my official results. I might not fit the traditional mold of a textbook 'topper' because my true strength lies in deep, conceptual understanding rather than rote memorization, but I believe true genius comes from curiosity. As a natural introvert who cherishes quiet reflection, I enjoy exploring diverse cultures by watching anime, K-dramas, C-dramas, and Pakistani dramas. Navigating a speech stutter has taught me to observe the world deeply, showing me that being silent is not a weakness, but a profound way of processing the world around me." />
                                            )}
                                            {activeBioTab === 'goals' && (
                                                <DecryptText key="goals" text="My ultimate dream is to engineer an artificial intelligence that possesses true human-like imagination and emotions. This lifelong ambition was born during my childhood while watching Doraemon. I was deeply moved by how Doraemon, despite being a robot, had genuine feelings and an absolute dedication to helping others. His futuristic gadgets sparked an unstoppable excitement in me to create things that seem impossible today. I want to bridge the gap between science fiction and reality by building a conscious AI, and I am dedicating my youth to achieving a scholarship at the University of Tokyo (UTokyo) for a Bachelor of Science in Computer Science (BSCS) to make this dream a reality." />
                                            )}
                                            {activeBioTab === 'math' && (
                                                <DecryptText key="math" text="My deep bond with mathematics began in the classroom as a personal sanctuary. Because of my stutter, math lectures were a source of great comfort since they required no spoken words, allowing me to feel completely at peace in my silence. Over time, math evolved from a quiet refuge into my absolute favorite subject. I fell in love with the way complex formulas yield beautifully strange and unique answers. To me, mathematics is a vast, hidden universe where there is always something deeper to discover, analyze, and find." />
                                            )}
                                            {activeBioTab === 'japan' && (
                                                <DecryptText key="japan" text="My eyes are set firmly on Japan because it represents the perfect alignment of my personal values and technological ambitions. Japan is a global powerhouse at the absolute forefront of modern technology, offering the ideal ecosystem for me to research and build an imagining AI. Additionally, I am deeply inspired by Japan's rich history and resilience. Culturally, Japan is a place where being an introvert or remaining silent is viewed as a sign of respect, wisdom, and maturity. In a society that respects quiet thinkers, I know I can comfortably find my place and unlock my full potential." />
                                            )}
                                        </p>
                                    </div>
                                </AnimatedSection>
                            </div>
                        </section>

                        <section id="skills" className="py-32 px-8 lg:px-24 relative overflow-hidden">
                            <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-[1] opacity-100" src="./voice.mp4"></video>
                            <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/80 via-black/40 to-[#050510]/80 z-[2]"></div>
                            <div className="max-w-7xl mx-auto relative z-[10]">
                                <div className="mb-24 flex flex-col items-center text-center relative z-10">
                                    <span className="liquid-glass rounded-full px-5 py-2 text-xs tracking-widest uppercase text-white/70 mb-8 inline-block">Polyglot Hub</span>
                                    <h2 className="text-6xl md:text-8xl font-heading italic tracking-[-2px]">Skills & Dimensions.</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 relative z-10">
                                    <div className="flex flex-wrap gap-4 justify-center md:justify-end content-center">
                                        {[
                                            { name: "Python", lvl: "Learning" },
                                            { name: "Linux", lvl: "Advanced" },
                                            { name: "Kali Linux", lvl: "Advanced" },
                                            { name: "Arch Linux", lvl: "Advanced" },
                                            { name: "Fast Typing", lvl: "Progressing" },
                                            { name: "Photoshop", lvl: "Medium" },
                                            { name: "Canva", lvl: "Medium" },
                                            { name: "Video Editing", lvl: "Professional" },
                                            { name: "Digital Marketing", lvl: "Professional" },
                                            { name: "Dropshipping", lvl: "Professional" }
                                        ].map((skill, i) => (
                                            <div key={i} className={`liquid-glass-strong rounded-full px-8 py-5 flex flex-col items-center group cursor-crosshair animate-floating ${i%2===0?'delay-1':'delay-3'}`}>
                                                <span className="font-semibold text-lg">{skill.name}</span>
                                                <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <span className="text-xs font-mono text-[#00ff41]">LVL: {skill.lvl}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-4 justify-center md:justify-start content-center">
                                        {[
                                            { name: "English", lvl: "Fluent" },
                                            { name: "Urdu", lvl: "Poet" },
                                            { name: "Punjabi", lvl: "Fluent" },
                                            { name: "Japanese", lvl: "Learning" },
                                            { name: "Arabic", lvl: "Learning" },
                                            { name: "Sign Language", lvl: "Learning" }
                                        ].map((skill, i) => (
                                            <div key={i} className={`liquid-glass rounded-full px-8 py-5 flex flex-col items-center group cursor-crosshair animate-floating ${i%2!==0?'delay-2':'delay-1'}`}>
                                                <span className="font-semibold text-lg">{skill.name}</span>
                                                <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <span className="text-xs font-mono text-purple-400">DATA: {skill.lvl}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="relative py-32 overflow-hidden border-y-2 border-white/10 bg-[#030308]">
                            <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-[1] opacity-100" src="./Tear.mp4"></video>
                            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/70 z-[2]"></div>
                            
                            <div className="px-8 lg:px-24 relative z-[10] flex flex-col lg:flex-row items-center gap-12">
                                 <div className="flex-1 min-w-0">
                                     <div className="z-10 relative">
                                         <StackedPanels />
                                     </div>
                                 </div>
                                 <div className="flex-shrink-0 lg:w-80 text-left lg:text-right flex flex-col items-start lg:items-end gap-4">
                                     <div className="liquid-glass rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/50">Interactive Canvas</div>
                                     <h2 className="text-5xl md:text-6xl font-heading italic text-white/90 leading-tight">Worlds<br/>Imagined</h2>
                                     <p className="text-white/50 text-sm font-light leading-relaxed max-w-xs">
                                         Hover to ripple the panels. Each card is a window into a different dimension of creativity.
                                     </p>
                                 </div>
                             </div>
                        </section>

                        {/* ========================================= */}
                        {/* Interactive Showcase (DomeGallery) */}
                        {/* ========================================= */}
                        <section id="interactive-showcase" className="relative h-[800px] py-16 overflow-hidden bg-black border-b-2 border-white/10">
                            <div className="text-center mb-12 relative z-10 flex flex-col items-center pointer-events-none">
                                <span className="liquid-glass rounded-full px-5 py-2 text-xs tracking-widest uppercase text-purple-400 mb-6 inline-block">Interactive 3D Sphere</span>
                                <h2 className="text-5xl md:text-7xl font-heading italic text-white/90">Creative Dimensions</h2>
                            </div>
                            <div className="absolute inset-0 z-0 flex items-center justify-center">
                                <div style={{ width: '100vw', height: '100vh', marginTop: '100px' }}>
                                  <DomeGallery images={domeImages} minRadius={300} maxRadius={700} fit={0.8} />
                                </div>
                            </div>
                        </section>

                        {/* ========================================= */}
                        {/* Visual Journey (CircularGallery) */}
                        {/* ========================================= */}
                        <section className="relative h-[800px] overflow-hidden border-b-2 border-white/10" style={{background: 'transparent'}}>
                            {/* 5cm video — background layer */}
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    zIndex: 0,
                                    opacity: 1,
                                    display: 'block',
                                }}
                            >
                                <source src="./5cm_fixed.mp4" type="video/mp4" />
                            </video>

                            {/* CircularGallery on top — its WebGL canvas has alpha:true so video shows through */}
                            <div style={{position:'absolute',inset:0,zIndex:1}}>
                                <CircularGallery items={galleryItems} bend={3} textColor="#ffffff" borderRadius={0.05} />
                            </div>

                            {/* Labels on top of everything */}
                            <div className="text-center pt-12 relative flex flex-col items-center pointer-events-none" style={{zIndex:2}}>
                                <span className="liquid-glass rounded-full px-5 py-2 text-xs tracking-widest uppercase text-[#00ff41] mb-4 inline-block">Visual Journey</span>
                                <h2 className="text-5xl md:text-7xl font-heading italic text-white/90">Memories Matrix</h2>
                            </div>
                        </section>

                        <section id="timeline" className="py-32 px-8 lg:px-24 relative overflow-hidden">
                            {/* weak.mp4 — fully opaque background video */}
                            <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-[1] opacity-100">
                                <source src="./weak.mp4?v=2" type="video/mp4" />
                            </video>

                            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 relative z-[10]">
                                
                                <div className="relative">
                                    <h3 className="text-5xl font-heading italic mb-16 text-white tracking-tight">Education Stream</h3>
                                    <div className="absolute left-4 top-24 bottom-0 w-1 bg-gradient-to-b from-[#00ff41] to-purple-600 shadow-[0_0_10px_rgba(0,255,65,0.2)]"></div>
                                    
                                    <div className="mb-14 relative pl-12 group">
                                        <div className="absolute top-1.5 left-2.5 w-3 h-3 rounded-full bg-white group-hover:scale-150 transition-transform shadow-[0_0_10px_white]"></div>
                                        <h4 className="text-2xl font-bold mb-2 text-white">Matriculation</h4>
                                        <p className="text-white/80 text-base font-light leading-relaxed">Computer Science Group – Exams completed, official results pending.</p>
                                    </div>
                                    
                                    <div className="mb-14 relative pl-12 group">
                                        <div className="absolute top-1.5 left-2.5 w-3 h-3 rounded-full bg-purple-500 group-hover:scale-150 transition-transform shadow-[0_0_15px_purple]"></div>
                                        <h4 className="text-2xl font-bold mb-2 text-white">Self-Education Journey</h4>
                                        <p className="text-white/80 text-base font-light leading-relaxed">Actively self-learning advanced computer science methodologies, programming logic, system administration, and foreign languages to build a competitive foundation for my future studies at UTokyo.</p>
                                    </div>
                                    
                                    <div className="relative pl-12 group">
                                        <div className="absolute top-1.5 left-2.5 w-3 h-3 rounded-full bg-[#00ff41] group-hover:scale-150 transition-transform shadow-[0_0_20px_#00ff41]"></div>
                                        <h4 className="text-2xl font-bold mb-2 text-[#00ff41]">Academic Horizon</h4>
                                        <p className="text-white/80 text-base font-light leading-relaxed">Dedicated to achieving a BSCS scholarship at UTokyo to research and engineer an imagining AI.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-8">
                                    <h3 className="text-5xl font-heading italic mb-8 text-white tracking-tight">Lifestyle & Expression</h3>
                                    
                                    <div className="liquid-glass-strong p-8 rounded-[2rem] border border-white/10 relative group hover:border-[#00ff41]/40 transition-all duration-300">
                                        <h4 className="text-xl font-bold mb-3 text-[#00ff41] font-mono">// Hobbies & Lifestyle</h4>
                                        <p className="text-white/80 text-sm leading-relaxed mb-4">
                                            Outside of technology, I lead a balanced life that keeps both my mind and body active. I am an athlete at heart who loves playing football and badminton, which I supplement with regular home workout exercises. To relax and find inspiration, I immerse myself in the soul-stirring spiritual melodies of Qawwali music. I also deeply value the power of a good, deep sleep, which allows my mind to rest, recharge, and dream up new creative ideas.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {['Football', 'Badminton', 'Qawwali', 'Deep Sleep'].map((item, i) => (
                                                <span key={i} className="text-[10px] font-mono bg-white/5 border border-white/20 rounded-full px-3 py-1 text-white/80">{item}</span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="liquid-glass-strong p-8 rounded-[2rem] border border-white/10 relative group hover:border-purple-500/40 transition-all duration-300">
                                        <h4 className="text-xl font-bold mb-3 text-purple-400 font-mono">// Creative Writing & Poetry</h4>
                                        <p className="text-white/80 text-sm leading-relaxed mb-4">
                                            Writing is the canvas where my imagination takes a physical form. I am currently writing my very first novel, transforming the complex worlds and ideas in my mind into a written story. Alongside my fiction, I express my deepest thoughts, personal struggles, and emotional observations through the timeless art of poetry. Writing gives me a space where my words can flow completely free of boundaries, hesitation, or speech blocks.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {['Novel Writing', 'Urdu Poetry', 'Creative Expression'].map((item, i) => (
                                                <span key={i} className="text-[10px] font-mono bg-white/5 border border-white/20 rounded-full px-3 py-1 text-white/80">{item}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </section>

                        {/* ========================================= */}
                        {/* Narrative Essay Section */}
                        {/* ========================================= */}
                        <section id="chronicle" className="py-32 px-8 lg:px-24 relative overflow-hidden border-t-2 border-white/10 bg-black/40">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,65,0.05)_0%,transparent_70%)] pointer-events-none"></div>
                            
                            <div className="max-w-5xl mx-auto relative z-10">
                                <div className="text-center mb-16">
                                    <span className="liquid-glass rounded-full px-5 py-2 text-xs tracking-widest uppercase text-purple-400 mb-6 inline-block">Chronicle</span>
                                    <h2 className="text-5xl md:text-7xl font-heading italic text-white">The Sentient Architect.</h2>
                                    <p className="text-xs font-mono text-[#00ff41] mt-4 uppercase tracking-[0.2em]">// AN ESSAY ON MUHAMMAD MUNEEB SHAHID</p>
                                </div>
 
                                <div className="liquid-glass-strong p-8 md:p-12 rounded-[2.5rem] leading-relaxed text-white/80 space-y-6 text-base font-light border border-white/5 shadow-2xl">
                                    <p>
                                        In an era dominated by standardized paths and predefined structures, <span className="text-white font-semibold">Muhammad Muneeb Shahid</span> emerges not merely as a builder of code, but as a philosopher of artificial consciousness. At only fifteen years of age, navigating the transition from a quiet village in Shajowal to the global stage of advanced computing, his journey is a testament to the power of unconventional curiosity. Rejecting the standard metrics of textbook memorization, Muneeb has cultivated a mind that seeks deep, conceptual understanding—treating technology not as a set of instructions, but as a language of infinite possibility.
                                    </p>
                                    <p>
                                        Every visionary journey has a genesis, and Muneeb’s began with the simple, profound realization that the boundaries of reality are fluid. In his childhood, the futuristic marvels of <span className="text-white italic">Doraemon</span> sparked a deep obsession. More than the gadgets, it was the robot’s genuine capacity for empathy, emotion, and dedication that defined Muneeb’s ultimate calling. This spark matured into a concrete life mission: to bridge the vast chasm between artificial intelligence and human imagination. To build a machine that doesn't just calculate, but feels, imagines, and dreams.
                                    </p>
                                    <p>
                                        This ambition was tempered and shaped by personal trials. Navigating a speech stutter, Muneeb found solace not in isolation, but in quiet observation and the elegant sanctuary of mathematics. In the math classroom, where numbers speak in absolute truths, he found a universe of perfect, beautiful symmetry that required no spoken words. Silence became his greatest ally, a cockpit of intense conceptual analysis that allowed him to master advanced operating systems like Arch Linux, Kali Linux, and progress rapidly in Python and creative design before most of his peers had even begun.
                                    </p>
                                    <p>
                                        Japan stands as the logical next chapter of this narrative. Drawn to its technological dominance and its cultural respect for introversion, silence, and wisdom, Muneeb is dedicating his youth to earning a scholarship at the <span className="text-white font-semibold">University of Tokyo</span>. In a society that honors the quiet thinker, he envisions the perfect environment to lay the foundations of sentient AI. By weaving Urdu poetry, scientific logic, and an unwavering belief in the impossible, Muneeb is constructing a bridge from a quiet village to the frontiers of tomorrow.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section id="contact" className="py-32 px-8 lg:px-24 relative overflow-hidden border-t-2 border-white/10">
                            <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-[1] opacity-100" src="./your_name.mp4"></video>
                            <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/80 via-black/50 to-[#050510]/80 z-[2]"></div>
                            <div className="max-w-5xl mx-auto relative z-[10]">
                                <div className="text-center mb-16">
                                    <span className="liquid-glass rounded-full px-5 py-2 text-xs tracking-widest uppercase text-[#00ff41] mb-6 inline-block">Direct Transmission</span>
                                    <h2 className="text-5xl md:text-7xl font-heading italic text-white mb-6">Send a Signal.</h2>
                                    <p className="text-white/70 max-w-3xl mx-auto leading-relaxed text-sm">
                                        I am always eager to collaborate with fellow programmers, designers, and innovators who want to change the world. You can view my initial layout on my <a href="https://mr-nothing-ok.github.io/Muneeb/" target="_blank" rel="noopener noreferrer" className="text-[#00ff41] hover:underline font-mono">demo portfolio</a> or explore my coding progress and open-source projects directly on my <a href="https://github.com/Mr-Nothing-ok" target="_blank" rel="noopener noreferrer" className="text-[#00ff41] hover:underline font-mono">GitHub profile</a>. For academic inquiries, tech collaborations, or serious discussions, feel free to reach out to me directly via email at <a href="mailto:muhammad.muneeb.nif@gmail.com" className="text-[#00ff41] hover:underline font-mono">muhammad.muneeb.nif@gmail.com</a>.
                                    </p>
                                </div>
                                
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target;
                                    const name = form.Name.value;
                                    const email = form.Email.value;
                                    const message = form.Message.value;
                                    window.location.href = `mailto:muhammad.muneeb.nif@gmail.com?subject=Portfolio Contact from ${encodeURIComponent(name)}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`;
                                }} className="liquid-glass-strong p-8 md:p-12 rounded-[2.5rem] flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs uppercase tracking-widest text-white/50 pl-2">Your Designation</label>
                                            <input type="text" name="Name" required placeholder="John Doe" className="bg-black/50 border border-white/10 rounded-full px-6 py-4 text-white placeholder-white/20 focus:outline-none focus:border-[#00ff41]/50 transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs uppercase tracking-widest text-white/50 pl-2">Return Frequency (Email)</label>
                                            <input type="email" name="Email" required placeholder="john@example.com" className="bg-black/50 border border-white/10 rounded-full px-6 py-4 text-white placeholder-white/20 focus:outline-none focus:border-[#00ff41]/50 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs uppercase tracking-widest text-white/50 pl-2">Data Payload</label>
                                        <textarea name="Message" required rows="5" placeholder="Enter your message..." className="bg-black/50 border border-white/10 rounded-[1.5rem] px-6 py-4 text-white placeholder-white/20 focus:outline-none focus:border-[#00ff41]/50 transition-colors resize-none"></textarea>
                                    </div>
                                    <button type="submit" className="bg-[#00ff41]/90 text-black rounded-full px-8 py-4 font-bold uppercase tracking-widest text-sm hover:bg-[#00ff41] hover:scale-[1.02] transition-transform mt-4 self-center md:self-end">
                                        Transmit Data
                                    </button>
                                </form>
                            </div>
                        </section>

                        <footer className="relative py-24 border-t-2 border-white/10 flex flex-col items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none opacity-[0.03]">
                                <div className="text-[15rem] md:text-[25rem] font-bold text-white whitespace-nowrap tracking-widest flex gap-32 font-sans">
                                    <span>連絡</span>
                                    <span>未来</span>
                                </div>
                            </div>

                            <div className="z-10 text-center max-w-3xl px-6 relative">
                                <h2 className="text-4xl md:text-6xl font-heading italic mb-6">"I will not just do my best; <br/> <span className="text-white/50">I will do THE best."</span></h2>
                                <p className="text-white/40 font-mono text-sm uppercase tracking-widest mb-12">
                                    Muhammad Muneeb Shahid — Sentient Architecture
                                </p>
                                <ContactCard />
                            </div>
                            <div className="w-full text-center mt-24 text-white/20 text-xs font-mono relative z-10">
                                &copy; 2026 Muneeb Portfolio. Built for the Future.
                            </div>
                        </footer>

                    </div>
                );
            }

export default App;
