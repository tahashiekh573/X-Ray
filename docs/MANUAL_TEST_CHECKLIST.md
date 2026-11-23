# Manual real-device validation checklist

Automated tests use fake cameras and software GL. Run this checklist on real hardware before a
release, and record the device, browser, camera and measured FPS (HUD) for each run.

| Device / OS | Browser | Camera | Render FPS | Tracking FPS | Tester | Date |
|---|---|---|---|---|---|---|
| | | | | | | |

## 1. Camera
- [ ] First visit: pressing **Start camera** shows the browser permission prompt, and nothing
      starts before that.
- [ ] Denying permission shows "Camera permission denied" with a working **Try again**.
- [ ] Live video appears mirrored: raising your right hand moves the image on the right side.
- [ ] With two cameras (laptop + USB), the selector appears and switching works without a reload.
- [ ] Unplugging the USB camera while live shows "Camera disconnected" with recovery.
- [ ] Opening the camera in another app first shows "Camera is busy".
- [ ] **Stop camera** turns the OS camera indicator light off within about 1 s.
- [ ] Closing or reloading the tab releases the camera (indicator light off).

## 2. Face tracking and skull
- [ ] "Face tracked" appears within about 2 s of looking at the camera.
- [ ] The eye sockets sit over your eyes and the teeth over your mouth when facing forward.
- [ ] Moving closer or farther keeps the skull aligned and scales it.
- [ ] Turning the head ±45° yaw and ±25° pitch, and tilting ±20° roll, rotates the skull with you.
- [ ] Leaving the frame fades the anatomy out ("Face not found" hint); returning reacquires it
      without a jump.
- [ ] Switching away from the tab and back resumes tracking without a jump.
- [ ] Dim lighting shows the low-light hint.

## 3. Jaw
- [ ] Opening the mouth slowly rotates the mandible smoothly; closing returns it.
- [ ] Talking does not make the jaw flicker. Lip-only movements barely move it (dead zone).
- [ ] With Muscles on, the masseter and lower lip ring follow the jaw.

## 4. Layers, look and mixed reality
- [ ] Each layer checkbox toggles independently with a fade. The Skull, Brain, Muscles and
      Everything buttons work.
- [ ] X-ray, Solid and Wireframe render as described. Brightness, Opacity and tint change the
      model live.
- [ ] Reveal modes: Full head, Lens (drag to move; a touch drag on mobile), Follow face, Split
      (both sides), Anatomy only, Camera only.
- [ ] Feather, Real-me showing through, Lens size, Blend and Blend style visibly change the
      composite.
- [ ] A raised hand in front of the face hides the skull behind it (hand occlusion).

## 5. Hands
- [ ] Both hands are detected. The status chip shows the count.
- [ ] Bones follow finger bending (make a fist, spread the fingers) and wrist rotation.
- [ ] The left and right skeletons are mirror images. In debug mode, the handedness label matches
      the hand you raised.

## 6. Labels and learning
- [ ] With Show Labels on, labels stay readable and track their structures without covering the
      whole view.
- [ ] Clicking or tapping a bone selects it: highlight plus info card. Related structures are
      navigable, and Esc closes the card.
- [ ] Learning mode shows the explorer list. Schematic muscles show the "schematic" notice.

## 7. Calibration
- [ ] **Auto Calibration** while facing the camera completes in about 1–2 s with "Calibrated".
- [ ] Each manual slider changes the model as labelled. **Reset Fit** restores the default.
- [ ] "Remember fit on this device" persists across a reload. Unchecking it forgets the fit.

## 8. Capture, performance, accessibility and mobile
- [ ] Screenshot (button or **S**) downloads a PNG with the video, anatomy, labels and the
      disclaimer watermark.
- [ ] Low, Balanced and High modes change the FPS and quality. Balanced reaches ≥ 30 FPS on the
      target hardware (record the value).
- [ ] The whole UI is usable by keyboard (Tab, Space/Enter, shortcuts list via **?**) with visible
      focus.
- [ ] With OS reduced motion on, the preview rotation stops and transitions are instant.
- [ ] Android Chrome and iOS Safari work in portrait and landscape. The side panels open as
      drawers, and Fit/Fill works.
- [ ] Network panel: during a session only same-origin GETs appear, with no uploads.
