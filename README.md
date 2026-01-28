# Night-at-Sea-Animation

# WebGL Ocean Scene (Boat + Sharks)

A real-time WebGL animation scene featuring an ocean surface with animated waves, a textured boat model, multiple shark models, and a skybox environment. The water uses a moving normal-map pattern, Fresnel reflectance, and planar reflections rendered to a framebuffer for a more realistic look. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2}

> **Demo:** (add link here)  
> **Screenshots/GIFs:** (optional)

---

## Features

- **Animated water surface** using a tiled normal/noise texture sampled over time. :contentReference[oaicite:3]{index=3} :contentReference[oaicite:4]{index=4}
- **Planar reflections** rendered into a framebuffer texture and applied to the water surface. :contentReference[oaicite:5]{index=5} :contentReference[oaicite:6]{index=6} :contentReference[oaicite:7]{index=7}
- **Skybox cubemap** for environment/background + reflective contribution on water. :contentReference[oaicite:8]{index=8} :contentReference[oaicite:9]{index=9}
- **OBJ model loading** for multiple sharks and a multi-material boat (OBJ + MTL). :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11}
- **Two camera modes**: free-fly camera and chase/orbit camera (toggle + target switching). :contentReference[oaicite:12]{index=12} :contentReference[oaicite:13]{index=13}

---

## Controls

### Free Camera (default)
- **Arrow Left/Right**: yaw rotation (turn left/right) :contentReference[oaicite:14]{index=14}  
- **Arrow Up/Down**: pitch rotation (look up/down) :contentReference[oaicite:15]{index=15}  
- **Z**: move forward :contentReference[oaicite:16]{index=16}  
- **X**: move backward :contentReference[oaicite:17]{index=17}  

### Chase / Orbit Camera
- **F**: toggle chase/orbit mode :contentReference[oaicite:18]{index=18}  
- While in chase mode, use:
  - **Arrow keys**: orbit around the followed object (yaw/pitch) :contentReference[oaicite:19]{index=19}  
  - **W**: follow boat :contentReference[oaicite:20]{index=20}  
  - **A**: follow hammerhead shark :contentReference[oaicite:21]{index=21}  
  - **S**: follow white-tipped shark :contentReference[oaicite:22]{index=22}  
  - **D**: follow reef shark :contentReference[oaicite:23]{index=23}  

---

## UI / Parameters

- **Hammerhead vertical offset slider** (`hammerY`) updates the hammerhead Y-offset live. :contentReference[oaicite:24]{index=24}

---

## Running Locally

Because the project loads assets with `fetch()` (OBJ/MTL) and image textures, it should be run from a **local web server** (not by double-clicking the HTML file).

### Option A: Python simple server
From the project root:
```bash
python3 -m http.server 8000

