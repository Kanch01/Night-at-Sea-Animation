# Night-at-Sea-Animation

# WebGL Ocean Scene (Boat + Sharks)

A real-time WebGL animation scene featuring an ocean surface with animated waves, a textured boat model, multiple shark models, and a skybox environment. The water uses a moving normal-map pattern, Fresnel reflectance, and planar reflections rendered to a framebuffer for a more realistic look. Screenshots of the project can be found in the FinalCCG pdf.

> **Demo:** (add link here)  

---

## Notable Features

- **Animated water surface** using a tiled normal/noise texture sampled over time.
- **Planar reflections** rendered into a framebuffer texture and applied to the water surface.
- **Skybox cubemap** for environment/background and reflective contribution on water.
- **OBJ model loading** for multiple sharks and a multi-material boat (OBJ and MTL). 
- **Two camera modes**: free-fly camera, chase, and orbit camera with toggling and target switching.

---

## Controls

### Free Camera (default)
- **Arrow Left/Right**: yaw rotation (turn left/right)
- **Arrow Up/Down**: pitch rotation (look up/down)
- **Z**: move forward
- **X**: move backward

### Chase / Orbit Camera
- **F**: toggle chase/orbit mode
- While in chase mode, use:
  - **Arrow keys**: orbit around the followed object (yaw/pitch)
  - **W**: follow boat
  - **A**: follow hammerhead shark
  - **S**: follow white-tipped shark
  - **D**: follow reef shark
 
Controls are also detailed when running the project.

---

## UI / Parameters

- **Hammerhead vertical offset slider** (`hammerY`) updates the hammerhead Y-offset live.

---

## Running Locally

Because the project loads assets with `fetch()` and image textures, it should be run from a local web server. A simple way to do this is to use python3 -m http.server.

