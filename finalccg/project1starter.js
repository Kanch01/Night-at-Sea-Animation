const WATER_VSHADER_SOURCE = `
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;

    attribute vec3 a_Position;
    attribute vec2 a_TexCoord;

    varying vec2 v_TexCoord;
    varying vec3 v_WorldPos;

    void main() {
        vec4 worldPos = u_World * u_Model * vec4(a_Position, 1.0);
        gl_Position = u_Camera * worldPos;
        v_TexCoord = a_TexCoord;
        v_WorldPos = worldPos.xyz;
    }
`

const WATER_FSHADER_SOURCE = `
    precision mediump float;

    varying vec2 v_TexCoord;
    varying vec3 v_WorldPos;

    uniform float time;
    uniform sampler2D normalSampler;

    // added 50
    // Noise-based normal sampling for waves
    vec4 getNoise(vec2 uv){
        vec2 uv0 = (uv/103.0)+vec2(time/137.0, time/149.0);
        vec2 uv1 = uv/107.0-vec2(time/-139.0, time/141.0);
        vec2 uv2 = uv/vec2(897.0, 983.0)+vec2(time/151.0, time/147.0);
        vec2 uv3 = uv/vec2(991.0, 877.0)-vec2(time/159.0, time/-163.0);
        vec4 noise = (texture2D(normalSampler, uv0)) +
                     (texture2D(normalSampler, uv1)) +
                     (texture2D(normalSampler, uv2)) +
                     (texture2D(normalSampler, uv3));
        return noise*0.5-1.0;
    }

    // Moonlight
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform vec3 eyePos;
    uniform float uShiny;
    uniform float uSpec;
    uniform float uDiffuse;

    void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection,
                  float shiny, float spec, float diffuse,
                  inout vec3 diffuseColor, inout vec3 specularColor)
    {
        vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
        float direction = max(0.0, dot(eyeDirection, reflection));
        specularColor += pow(direction, shiny)*sunColor*spec;
        diffuseColor  += max(dot(sunDirection, surfaceNormal),0.0)*sunColor*diffuse;
    }

    // Planar reflection
    uniform sampler2D u_ReflectionTex;
    uniform mat4 u_ReflectionVP;

    // Skybox reflection
    uniform samplerCube u_Skybox;

    void main() {
        // Tile UVs
        float waveScale = 2.0;
        vec2 uv = v_WorldPos.xz * waveScale;

        // Animated normal from noise
        vec4 n = getNoise(uv);
        vec3 normal = normalize(vec3(n.xy, 1.0));

        // View direction
        vec3 viewDir = normalize(eyePos - v_WorldPos);

        // Moonlight diffuse and specular
        vec3 diffTerm = vec3(0.0);
        vec3 specTerm = vec3(0.0);
        sunLight(normal, viewDir, uShiny, uSpec, uDiffuse, diffTerm, specTerm);

        // Water base color
        // added an extra zero
        vec3 deepColor = vec3(0.02, 0.02, 0.02);
        vec3 shallowColor = vec3(0.16, 0.16, 0.16);
        float waveFactor = 0.5 + 0.5 * n.z;
        vec3 baseColor = mix(deepColor, shallowColor, waveFactor);

        // original ambient 0.20
        vec3 ambient = baseColor * 0.1;
        vec3 litDiffuse = baseColor * diffTerm;
        vec3 waterLighting = ambient + litDiffuse + specTerm;

        // Schlick approximation
        float cosTheta = clamp(dot(normalize(-viewDir), normal), 0.0, 1.0);
        float F0 = 0.45; // reflective constant
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

        // Planar reflection texture
        vec4 clip = u_ReflectionVP * vec4(v_WorldPos, 1.0);
        vec3 ndc = clip.xyz / clip.w;
        vec2 rUV = ndc.xy * 0.5 + 0.5;

        // Distort the reflection
        float distortStrength = 0.18;
        vec2 ripple = n.xy * distortStrength;
        rUV += ripple;

        // Only use reflection when we're inside the reflection frustum
        float inBounds = step(0.0, ndc.z) * step(ndc.z, 1.0);

        // Clamp after distortion
        rUV = clamp(rUV, 0.0, 1.0);

        // Planar reflection for objects
        vec3 planarReflection = texture2D(u_ReflectionTex, rUV).rgb * inBounds;

        // Reflection from skybox
        vec3 reflDir = reflect(-viewDir, normal);
        vec3 envReflection = textureCube(u_Skybox, reflDir).rgb;

        // Combine skybox and planar reflection
        float planarWeight = 0.4;
        float envWeight = 1.0 - planarWeight;
        vec3 reflectionColor = envWeight * envReflection + planarWeight * planarReflection;

        // Final mix
        vec3 finalColor = mix(waterLighting, reflectionColor, fresnel);

        gl_FragColor = vec4(finalColor, 1.0);
    }
`

const BOAT_VSHADER_SOURCE = `
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;

    attribute vec3 a_Position;
    attribute vec2 a_TexCoord;
    attribute vec3 a_Normal;

    varying vec2 v_TexCoord;
    varying vec3 v_WorldPos;
    varying vec3 v_Normal;

    void main() {
        mat4 MW = u_World * u_Model;
        vec4 worldPos = MW * vec4(a_Position, 1.0);
        gl_Position = u_Camera * worldPos;

        v_TexCoord = a_TexCoord;
        v_WorldPos = worldPos.xyz;

        mat3 normalMat = mat3(MW);
        v_Normal = normalize(normalMat * a_Normal);
    }
`

const BOAT_FSHADER_SOURCE = `
    precision mediump float;

    varying vec2 v_TexCoord;
    varying vec3 v_WorldPos;
    varying vec3 v_Normal;

    uniform sampler2D u_Sampler;

    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform vec3 eyePos;
    uniform float uShiny;
    uniform float uSpec;
    uniform float uDiffuse;

    void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection,
                  float shiny, float spec, float diffuse,
                  inout vec3 diffuseColor, inout vec3 specularColor)
    {
        vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
        float direction = max(0.0, dot(eyeDirection, reflection));
        specularColor += pow(direction, shiny)*sunColor*spec;
        diffuseColor += max(dot(sunDirection, surfaceNormal),0.0)*sunColor*diffuse;
    }

    void main() {
        vec3 base = texture2D(u_Sampler, v_TexCoord).rgb;

        vec3 N = normalize(v_Normal);
        vec3 viewDir = normalize(eyePos - v_WorldPos);

        vec3 diffTerm = vec3(0.0);
        vec3 specTerm = vec3(0.0);

        sunLight(N, viewDir, uShiny, uSpec, uDiffuse, diffTerm, specTerm);

        vec3 ambient = base * 0.15;
        vec3 litDiffuse = base * diffTerm;

        vec3 color = ambient + litDiffuse + specTerm;
        gl_FragColor = vec4(color, 1.0);
    }
`

const BOX_VSHADER_SOURCE = `
    attribute vec3 a_Position;
    varying vec3 v_Dir;

    uniform mat4 u_View;
    uniform mat4 u_Projection;

    void main() {
        v_Dir = a_Position;

        vec4 p = u_Projection * u_View * vec4(a_Position, 1.0);
        gl_Position = vec4(p.xy, p.w, p.w);
    }
`

const BOX_FSHADER_SOURCE = `
    precision mediump float;
    varying vec3 v_Dir;
    uniform samplerCube u_Skybox;

    void main() {
        gl_FragColor = textureCube(u_Skybox, normalize(v_Dir));
    }
`

const VSHADER_SOURCE = `
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;

    uniform float u_Time; 
    uniform vec4  u_Wave;

    // shark swim
    uniform vec2  u_Bounds; // (minAlong, invRangeAlong)
    uniform int   u_SwimEnable;
    uniform vec3  u_LongMask; // which axis is the body length
    uniform vec3  u_LatMask;  // which axis is lateral wag

    attribute vec3 a_Position;
    attribute vec3 a_Color;
    attribute vec3 a_Normal;

    varying vec3 v_Color;
    varying vec3 v_WorldPos;
    varying vec3 v_Normal;

    void main() {
        vec3 p = a_Position;
        vec3 n = a_Normal;

        // shark swim
        if (u_SwimEnable == 1) {
            float along = dot(p, u_LongMask);
            float t = clamp((along - u_Bounds.x) * u_Bounds.y, 0.0, 1.0);
            float phase = along * u_Wave.y + u_Time * u_Wave.z;
            float wag = sin(phase) * u_Wave.x * t;
            vec3 latOffset = wag * u_LatMask;
            p += latOffset;

            // twist
            vec3 upAxis = normalize(cross(u_LongMask, u_LatMask));
            float theta = wag * u_Wave.w;
            float c = cos(theta), s = sin(theta);
            vec3 pr = c * p + s * cross(upAxis, p) + (1.0 - c) * upAxis * dot(upAxis, p);
            p = pr;

            // rotate normal around upAxis
            vec3 nr = c * n + s * cross(upAxis, n) + (1.0 - c) * upAxis * dot(upAxis, n);
            n = nr;
        }

        mat4 MW = u_World * u_Model;
        vec4 worldPos = MW * vec4(p, 1.0);
        gl_Position = u_Camera * worldPos;

        v_WorldPos = worldPos.xyz;

        mat3 normalMat = mat3(MW);
        v_Normal = normalize(normalMat * n);

        v_Color = a_Color;
    }
`

const FSHADER_SOURCE = `
    precision mediump float;

    varying vec3 v_Color;
    varying vec3 v_WorldPos;
    varying vec3 v_Normal;

    // Moonlight direction
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform vec3 eyePos;
    uniform float uShiny;
    uniform float uSpec;
    uniform float uDiffuse;

    void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection,
                  float shiny, float spec, float diffuse,
                  inout vec3 diffuseColor, inout vec3 specularColor)
    {
        vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
        float direction = max(0.0, dot(eyeDirection, reflection));
        specularColor += pow(direction, shiny) * sunColor * spec;
        diffuseColor += max(dot(sunDirection, surfaceNormal), 0.0) * sunColor * diffuse;
    }

    void main() {
        vec3 N = normalize(v_Normal);
        vec3 viewDir = normalize(eyePos - v_WorldPos);

        vec3 diffTerm = vec3(0.0);
        vec3 specTerm = vec3(0.0);

        sunLight(N, viewDir, uShiny, uSpec, uDiffuse, diffTerm, specTerm);

        vec3 base = v_Color;
        vec3 ambient = base * 0.15;
        vec3 litDiffuse = base * diffTerm;

        vec3 color = ambient + litDiffuse + specTerm;

        gl_FragColor = vec4(color, 1.0);
    }
`

// Global reference to the webGL context and the canvas
let g_canvas;
let gl;

// Global to keep track of the time of the _previous_ frame
let g_lastFrameMS = 0;

// Globals to track if the given list of keys are pressed
let g_keysPressed = {};
const KEYS_TO_TRACK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'x'];

// shark meshes
let g_sharkMesh = [];
let g_hammerMesh = [];

// Per-mesh swim data
let g_sharkMinAlong = 0;
let g_sharkInvRangeAlong = 0;
let g_sharkLongMask = [0,0,1];
let g_sharkLatMask = [1,0,0];

// Vertex counts
let g_sharkVertCount = 0;
let g_hammerVertCount = 0;

// Skybox globals
let g_skyboxProgram = null;
let g_skyboxVBO = null;
let g_skybox_uView = null;
let g_skybox_uProj = null;
let g_skybox_uSampler = null;
let g_skyboxTexture = null;
let g_mainVBO = null;

// GLSL uniform references
let g_uModel_ref;
let g_uWorld_ref;
let g_uCamera_ref

// Usual Matrices
let g_modelMatrix;
let g_worldMatrix;

// Current axis of object rotation
let g_rotationAxis;

// Fly camera globals
let g_camPos = new Vector3([0.0, 0.12, 0.5]);
let g_yaw = 0.0;
let g_pitch = 0.0;
let g_camWorldPos = new Vector3([0.0, 0.12, 0.5]);

const FLY_ROTATION_SPEED = 0.1;
const FLY_MOVE_SPEED = 0.01;

let g_lastDeltaSec = 0.0;
let follow_chase = false;
let follow_target = 'boat';
let g_followDir = null; 

// Follow / chase orbit controls
const FOLLOW_ORBIT_SPEED = 0.02;
// let g_followOrbitAngleDeg = 90.0;  
let g_followOrbitYawDeg = 180.0;
let g_followOrbitPitchDeg = 10.0;

// Camera
let g_fovDeg = 45;
let g_near = 0.01;
let g_far = 5000.0;

// swim globals
let g_uTime_ref;
let g_uWave_ref;
let g_uBounds_ref;
let g_uSwimEnable_ref;
let g_uLongMask_ref;
let g_uLatMask_ref;

// Moon-light uniforms for sharks/reef
let g_uSunDir_ref;
let g_uSunColor_ref;
let g_uEyePos_ref;
let g_uShiny_ref;
let g_uSpec_ref;
let g_uDiffuse_ref;

// Hammer and reef jumping
let g_hammerBaseMatrix = null;

let g_hammerJumpH = 0.25;
let g_hammerJumpFreq = 0.4;
let g_hammerJumpRad = 0.0;
let g_hammerTilt = 15.0;

let g_sharkBaseMatrix = null;

let g_sharkOGM = null;
let g_hammerOGM = null;

// X-bounds for swim weighting
let g_minX = 0.0;
let g_invRangeX = 0.0;

// time passed
let g_totalTimeSec = 0;

// shark matrices
let g_modelMatrixShark;
let g_modelMatrixHammer;

let g_hammerYOffset = 0.0;

// Linear path globals (positions, matrices, offsets)
let g_pathParam = 0.0;
const PATH_SPEED = 2.0; 
const PATH_LENGTH = 60.0;

let g_boatStartPos = null;

let g_boatLocalMatrix = null;

let g_boat_uSunDir = null;
let g_boat_uSunColor = null;
let g_boat_uEyePos = null;
let g_boat_uShiny = null;
let g_boat_uSpec = null;
let g_boat_uDiffuse = null;

let g_sharkHeightOffset = 0.0;
let g_hammerHeightOffset = 0.0;
let g_boatHeightOffset = 0.0;

// White tipped Reef Shark
let g_whiteMesh = []; 
let g_whiteVertCount = 0;
let g_whiteOGM = null;
let g_modelMatrixWhite;

// shark normals
let g_sharkNormals = [];
let g_hammerNormals = [];
let g_whiteNormals = [];

let g_reflectionFBO = null;
let g_reflectionTex = null;
let g_reflectionDepth = null;
let g_reflectVP = null;

let g_water_uReflectionTex = null;
let g_water_uReflectionVP  = null;

// Boat materials
// { matName: { positions: [], texcoords: [], vertexCount: 0 } }
let g_boatMeshesByMaterial = {};

// Boat submeshes
// Each element: { material, vbo, vertexCount, texture }
let g_boatSubmeshes = [];

// Boat transform
let g_boatModelMatrix;

// Boat shader program and uniforms
let g_boatProgram = null;
let g_boat_uModel = null;
let g_boat_uWorld = null;
let g_boat_uCamera = null;
let g_boat_uSampler = null;

// Water globals
let g_waterProgram = null;
let g_waterVBO = null;
let g_waterVertexCount = 0;
let g_water_uModel = null;
let g_water_uWorld = null;
let g_water_uCamera = null;
let g_water_uTime = null;
let g_water_uNormalSampler = null;
let g_waterTexture = null;

let g_water_uSunDir = null;
let g_water_uSunColor = null;
let g_water_uEyePos = null;
let g_water_uShiny = null;
let g_water_uSpec = null;
let g_water_uDiffuse = null;

let g_water_uSkybox = null;

// Boat textures
let g_boatMaterialTextures = {};

// The size in bytes of a floating point
const FLOAT_SIZE = 4;

function main() {
    // Keep track of time each frame by starting with our current time
    g_lastFrameMS = Date.now();

    g_canvas = document.getElementById('canvas');

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    // Setup our reactions from keys
    setupKeyBinds();

    // We will call this at the end of most main functions from now on
    loadOBJFiles();
}

/*
 * Helper function to load OBJ files in sequence
 * For much larger files, you may are welcome to make this more parallel
 * I made everything sequential for this class to make the logic easier to follow
 */
async function loadOBJFiles() {
    // open our OBJ file(s)
    const sharkTxt = await fetch('./resources/shark.obj').then(r => r.text());
    readSharks(sharkTxt, g_sharkMesh, g_sharkNormals);

    const hammerTxt = await fetch('./resources/hammerhead.obj').then(r => r.text());
    readSharks(hammerTxt, g_hammerMesh, g_hammerNormals);

    const whiteTxt = await fetch('./resources/Whitetipped.obj').then(r => r.text());
    readSharks(whiteTxt, g_whiteMesh, g_whiteNormals);

    const boatObjTxt = await fetch('./resources/12219_boat_v2_L2.obj').then(r => r.text());
    parseBoatWithMaterials(boatObjTxt);

    const boatMtlTxt = await fetch('./resources/12219_boat_v2_L2.mtl').then(r => r.text());
    parseBoatMTL(boatMtlTxt);

    // Start our first frame
    startRendering();
}

function startRendering() {
    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.');
        return;
    }

    // slider settings for hammerhead
    const slider = document.getElementById('hammerY');
    if (slider) {
        const label = document.getElementById('hammerYValue');
        const apply = (v) => {
            g_hammerYOffset = parseFloat(v);
            if (label) label.textContent = g_hammerYOffset.toFixed(2);
        };
        apply(slider.value);
        slider.addEventListener('input', e => apply(e.target.value));
    }

    // Analyze shark meshes
    const sharkInfo = analyzeMeshAndColors(g_sharkMesh);
    const hammerInfo = analyzeMeshAndColors(g_hammerMesh);
    const whiteInfo = analyzeMeshAndColors(g_whiteMesh);

    // Stash swim data
    g_sharkMinAlong = sharkInfo.minAlong;
    g_sharkInvRangeAlong = sharkInfo.invRangeAlong;
    g_sharkLongMask = sharkInfo.longMask;
    g_sharkLatMask = sharkInfo.latMask;

    // Info
    const positions = g_sharkMesh.concat(g_hammerMesh, g_whiteMesh);
    const normals = g_sharkNormals.concat(g_hammerNormals, g_whiteNormals);
    const colors = sharkInfo.colors.concat(hammerInfo.colors, whiteInfo.colors);

    // Normal VBO
    const data = positions.concat(normals, colors);
    if (!initVBO(new Float32Array(data))) return;

    // Draw counts
    g_sharkVertCount = g_sharkMesh.length / 3;
    g_hammerVertCount = g_hammerMesh.length / 3;
    g_whiteVertCount = g_whiteMesh.length / 3;

    // Store offsets
    const sharkOffset = 0;
    const hammerOffset = sharkOffset + g_sharkVertCount;
    const whiteOffset = hammerOffset + g_hammerVertCount;

    g_drawOffsets = {sharkOffset, hammerOffset, whiteOffset};

    // Get refs to uniforms
    g_uModel_ref = gl.getUniformLocation(gl.program, 'u_Model');
    g_uWorld_ref = gl.getUniformLocation(gl.program, 'u_World');
    g_uCamera_ref = gl.getUniformLocation(gl.program, 'u_Camera');

    // Moonlight uniforms for main
    g_uSunDir_ref = gl.getUniformLocation(gl.program, 'sunDirection');
    g_uSunColor_ref = gl.getUniformLocation(gl.program, 'sunColor');
    g_uEyePos_ref = gl.getUniformLocation(gl.program, 'eyePos');
    g_uShiny_ref = gl.getUniformLocation(gl.program, 'uShiny');
    g_uSpec_ref = gl.getUniformLocation(gl.program, 'uSpec');
    g_uDiffuse_ref = gl.getUniformLocation(gl.program, 'uDiffuse');

    // Light direction
    const moonDir = new Vector3([0.0, 0.6, 1.0]);
    moonDir.normalize();
    gl.uniform3f(g_uSunDir_ref, moonDir.elements[0], moonDir.elements[1], moonDir.elements[2]);
    gl.uniform3f(g_uSunColor_ref, 0.6, 0.7, 1.0);
    gl.uniform1f(g_uShiny_ref, 84.0);
    gl.uniform1f(g_uSpec_ref, 1.4);
    gl.uniform1f(g_uDiffuse_ref, 0.7);

    // swim uniforms
    g_uTime_ref = gl.getUniformLocation(gl.program, 'u_Time');
    g_uWave_ref = gl.getUniformLocation(gl.program, 'u_Wave'); // vec4
    g_uBounds_ref = gl.getUniformLocation(gl.program, 'u_Bounds'); // vec2
    g_uSwimEnable_ref = gl.getUniformLocation(gl.program, 'u_SwimEnable');
    g_uLongMask_ref = gl.getUniformLocation(gl.program, 'u_LongMask');
    g_uLatMask_ref = gl.getUniformLocation(gl.program, 'u_LatMask');

    // Setup shark models
    g_modelMatrixShark = new Matrix4().scale(.1, .1, .1).translate(0.5, 0.1, 0);
    g_modelMatrixHammer = new Matrix4().scale(.003, .003, .003).translate(0.1, 0.1, -1.2);
    g_modelMatrixHammer.rotate(270, 0, 1, 0);
    g_modelMatrixWhite = new Matrix4().scale(.006, .006, .006).translate(-0.9, 0.1, 0.5);
    g_modelMatrixWhite.rotate(180, 0, 1, 0);

    g_hammerBaseMatrix = new Matrix4(g_modelMatrixHammer);
    g_sharkBaseMatrix = new Matrix4(g_modelMatrixShark);

    g_boatModelMatrix = new Matrix4().scale(0.001, 0.001, 0.001).rotate(270, 1, 0, 0).rotate(90, 0, 1, 0);
    g_boatModelMatrix.translate(0.8, 0, 1.4);

    // Matrix copies
    g_hammerOGM = new Matrix4(g_modelMatrixHammer);
    g_sharkOGM = new Matrix4(g_modelMatrixShark);
    g_whiteOGM = new Matrix4(g_modelMatrixWhite)

    // Local matrix and posiiton extraction
    const boatDecomp = decomposeMatrixToPosAndLocal(g_boatModelMatrix);
    g_boatStartPos = boatDecomp.pos;
    g_boatLocalMatrix = boatDecomp.local;

    // Vertical offsets relative to terrain height
    g_sharkHeightOffset = 0.1
    g_hammerHeightOffset = 0.1
    g_boatHeightOffset = g_boatStartPos.y

    // Place model in world
    g_worldMatrix = new Matrix4();

    // Render boat
    initBoatRendering(gl);

    // Enable culling and depth
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Render skybox
    initSkybox(gl);
    initWater(gl);
    initReflectionFramebuffer(gl);

    // Setup for ticks
    g_lastFrameMS = Date.now();
    g_rotationAxis = [0, 0, 0];

    tick();
}

// function to apply all the logic for a single frame tick
function tick() {
    // Calculate time since the last frame
    let currentTime = Date.now();
    let deltaMS = currentTime - g_lastFrameMS;
    g_lastFrameMS = currentTime;

    const deltaSec = deltaMS * 0.001;
    g_totalTimeSec += deltaSec;
    g_lastDeltaSec = deltaSec;

    // Update boat movement
    updateMotion(deltaSec);

    if (g_sharkOGM && g_hammerOGM && g_whiteOGM) 
    {
        const x = g_totalTimeSec;
        const basePhase = 2.0 * Math.PI * g_hammerJumpFreq * x + g_hammerJumpRad;
        const dz = g_pathParam;

        const sharkPhase = basePhase;
        const hammerPhase = basePhase;
        const whitePhase = basePhase + Math.PI * 0.5;

        const sharkJump = g_hammerJumpH * Math.sin(sharkPhase);
        const hammerJump = g_hammerJumpH * Math.sin(hammerPhase);
        const whiteJump = g_hammerJumpH * Math.sin(whitePhase);

        const sharkTilt = g_hammerTilt * Math.cos(sharkPhase);
        const hammerTilt = g_hammerTilt * Math.cos(hammerPhase);
        const whiteTilt = g_hammerTilt * Math.cos(whitePhase);

        // Reef shark
        let sharkM = new Matrix4();
        sharkM.setIdentity();
        sharkM.multiply(g_sharkOGM);
        sharkM.translate(0, -sharkJump, 0);
        sharkM.rotate(sharkTilt, 1, 0, 0);
        sharkM.translate(0, 0, dz);
        g_modelMatrixShark = sharkM;

        // Hammerhead
        let hammerM = new Matrix4();
        hammerM.setIdentity();
        hammerM.multiply(g_hammerOGM);
        hammerM.translate(0, hammerJump, 0);
        hammerM.rotate(-hammerTilt, 1, 0, 0);
        hammerM.translate(0, 0, dz);
        g_modelMatrixHammer = hammerM;

        // White-tipped
        let whiteM = new Matrix4();
        whiteM.setIdentity();
        whiteM.multiply(g_whiteOGM);
        whiteM.translate(0, -whiteJump, 0);
        whiteM.rotate(whiteTilt, 1, 0, 0);
        whiteM.translate(0, 0, dz);
        g_modelMatrixWhite = whiteM;
    }

    // Camera controls
    if (!follow_chase)
    {
        // Normal camera
        if (g_keysPressed['ArrowLeft']) g_yaw -= FLY_ROTATION_SPEED * deltaMS;
        if (g_keysPressed['ArrowRight']) g_yaw += FLY_ROTATION_SPEED * deltaMS;
        if (g_keysPressed['ArrowUp']) g_pitch += FLY_ROTATION_SPEED * deltaMS;
        if (g_keysPressed['ArrowDown']) g_pitch -= FLY_ROTATION_SPEED * deltaMS;

        const forw = getDirection(g_yaw, g_pitch);
        if (g_keysPressed['z'])
        {
            const step = forw.scaled(FLY_MOVE_SPEED * deltaMS);
            g_camPos = new Vector3([
                g_camPos.elements[0] + step.elements[0],
                g_camPos.elements[1] + step.elements[1],
                g_camPos.elements[2] + step.elements[2]
            ]);
        }
        if (g_keysPressed['x'])
        {
            const step = forw.scaled(FLY_MOVE_SPEED * deltaMS);
            g_camPos = new Vector3([
                g_camPos.elements[0] - step.elements[0],
                g_camPos.elements[1] - step.elements[1],
                g_camPos.elements[2] - step.elements[2]
               ]);
        }
    }
    else
    {
        if (g_keysPressed['ArrowLeft']) g_followOrbitYawDeg += FOLLOW_ORBIT_SPEED * deltaMS;
        if (g_keysPressed['ArrowRight']) g_followOrbitYawDeg -= FOLLOW_ORBIT_SPEED * deltaMS;
        if (g_keysPressed['ArrowUp']) g_followOrbitPitchDeg += FOLLOW_ORBIT_SPEED * deltaMS;
        if (g_keysPressed['ArrowDown']) g_followOrbitPitchDeg -= FOLLOW_ORBIT_SPEED * deltaMS;

        // Clamp vertical orbit
        g_followOrbitPitchDeg = clamp(g_followOrbitPitchDeg, -60.0, 60.0);
    }


    draw();

    // Call tick next frame
    requestAnimationFrame(tick, g_canvas);
}

// draw to the screen on the next frame
function draw() {
    gl.useProgram(gl.program);

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Update the camera matrix each frame based on camera values
    // Note that everything will (usually) use the same camera matrix
    // So we can just put all that here
    const V = calculateCameraMatrix();
    const P = calculateProjectionMatrix();

    drawReflection(P, V);

    // Skybox program
    if (g_skyboxProgram && g_skyboxVBO && g_skyboxTexture)
    {
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.useProgram(g_skyboxProgram);

        // Build view matrix with no translation
        const viewNT = new Matrix4(V);
        const e = viewNT.elements;
        e[12] = 0;
        e[13] = 0;
        e[14] = 0;

        gl.uniformMatrix4fv(g_skybox_uView, false, viewNT.elements);
        gl.uniformMatrix4fv(g_skybox_uProj, false, P.elements);
        gl.bindBuffer(gl.ARRAY_BUFFER, g_skyboxVBO);
        const aPos = gl.getAttribLocation(g_skyboxProgram, 'a_Position');
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aPos);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);

        gl.drawArrays(gl.TRIANGLES, 0, 36);

        // Restore
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);
        gl.useProgram(gl.program);
    }

    drawWater(V, P);

    gl.useProgram(gl.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_mainVBO);

    // VBO Layout
    const posFloatLen = g_sharkMesh.length + g_hammerMesh.length + g_whiteMesh.length;
    const normFloatLen = g_sharkNormals.length + g_hammerNormals.length + g_whiteNormals.length;
    const normalByteOffset = posFloatLen * FLOAT_SIZE;
    const colorByteOffset = (posFloatLen + normFloatLen) * FLOAT_SIZE;


    setupVec(3, 'a_Position', 0, 0);
    setupVec(3, 'a_Normal', 0, normalByteOffset);
    setupVec(3, 'a_Color', 0, colorByteOffset);

    const PV = new Matrix4(P).multiply(V);
    gl.uniformMatrix4fv(g_uCamera_ref, false, PV.elements);

    const eye = g_camWorldPos.elements;
    gl.uniform3f(g_uEyePos_ref, eye[0], eye[1], eye[2]);

    // Swim params
    const AMP = 0.6;
    const K = 0.20;
    const SPD = 4.0;
    const TW = 0.45;
    
    // Reef shark
    gl.uniformMatrix4fv(g_uModel_ref, false, g_modelMatrixShark.elements);
    gl.uniformMatrix4fv(g_uWorld_ref, false, g_worldMatrix.elements);

    gl.uniform1f(g_uTime_ref, g_totalTimeSec);
    gl.uniform4f(g_uWave_ref, AMP, K, SPD, TW);
    gl.uniform2f(g_uBounds_ref, g_sharkMinAlong, g_sharkInvRangeAlong);
    gl.uniform3f(g_uLongMask_ref, g_sharkLongMask[0], g_sharkLongMask[1], g_sharkLongMask[2]);
    gl.uniform3f(g_uLatMask_ref, g_sharkLatMask[0], g_sharkLatMask[1], g_sharkLatMask[2]);
    gl.uniform1i(g_uSwimEnable_ref, 1);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.sharkOffset, g_sharkVertCount);

    // White-tipped
    gl.uniformMatrix4fv(g_uModel_ref, false, g_modelMatrixWhite.elements);
    gl.uniformMatrix4fv(g_uWorld_ref, false, g_worldMatrix.elements);
    gl.uniform1i(g_uSwimEnable_ref, 0);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.whiteOffset, g_whiteVertCount);


    // Hammerhead shark
    const hammerModelNow = new Matrix4(g_modelMatrixHammer).translate(0, g_hammerYOffset, 0);
    gl.uniformMatrix4fv(g_uModel_ref, false, hammerModelNow.elements);
    gl.uniform1i(g_uSwimEnable_ref, 0);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.hammerOffset, g_hammerVertCount);

    // Draw boat
    {
        const eyeB = g_camWorldPos.elements;
        drawBoatWithPV(PV, eyeB);
    }
}

/**
 * Helper function to split out the camera math
 * You may want to modify this to have a free-moving camera
 */
function calculateCameraMatrix() 
{
    const UP = new Vector3([0, 1, 0]);

    // Follow mode
    if (follow_chase) 
    {
        const boatM = g_boatModelMatrix.elements;
        const boatPos = new Vector3([boatM[12], boatM[13], boatM[14]]);

        // Camera sits around boat
        const orbitRadius = 4.5;
        const baseHeight  = 1.3; // vertical offset of orbit center above boat

        const yawRad   = g_followOrbitYawDeg   * Math.PI / 180.0;
        const pitchRad = g_followOrbitPitchDeg * Math.PI / 180.0;

        // Pivot of the orbit (call it orbitCenter to avoid clashing with the
        // existing 'center' you use for lookAt at the end)
        const orbitCenter = new Vector3([
            boatPos.elements[0],
            boatPos.elements[1] + baseHeight,
            boatPos.elements[2]
        ]);

        const cosPitch = Math.cos(pitchRad);
        const sinPitch = Math.sin(pitchRad);

        // Spherical coords → Cartesian offset
        const offset = new Vector3([
            Math.cos(yawRad) * cosPitch * orbitRadius,
            sinPitch * orbitRadius,
            Math.sin(yawRad) * cosPitch * orbitRadius
        ]);

        const camPos = new Vector3([
            orbitCenter.elements[0] + offset.elements[0],
            orbitCenter.elements[1] + offset.elements[1],
            orbitCenter.elements[2] + offset.elements[2]
        ]);

        // Choose object to rotate to
        let targetMatrix = g_boatModelMatrix;
        
        if (follow_target === 'hammer' && g_modelMatrixHammer)
        {
            targetMatrix = g_modelMatrixHammer;
        }
        else if (follow_target === 'white' && g_modelMatrixWhite)
        {
            targetMatrix = g_modelMatrixWhite;
        }
        else if (follow_target === 'shark' && g_modelMatrixShark)
        {
            targetMatrix = g_modelMatrixShark;
        }
        else if (follow_target == 'boat' && g_boatModelMatrix)
        {
            targetMatrix = g_boatModelMatrix;
        }

        const te = targetMatrix.elements;
        const targetPos = new Vector3([te[12], te[13], te[14]]);

        // Direction from camera to target.
        let desiredDir = new Vector3([
            targetPos.elements[0] - camPos.elements[0],
            targetPos.elements[1] - camPos.elements[1],
            targetPos.elements[2] - camPos.elements[2]
        ]);

        desiredDir.normalize();

        if (!g_followDir) g_followDir = desiredDir;

        // Rotate toward direction
        const cur = g_followDir;
        const t = clamp(g_lastDeltaSec * 2.0, 0.0, 1.0);
        const lerped = new Vector3([
            cur.elements[0] + (desiredDir.elements[0] - cur.elements[0]) * t,
            cur.elements[1] + (desiredDir.elements[1] - cur.elements[1]) * t,
            cur.elements[2] + (desiredDir.elements[2] - cur.elements[2]) * t
        ]);

        lerped.normalize();
        g_followDir = lerped;

        const center = new Vector3([
            camPos.elements[0] + g_followDir.elements[0],
            camPos.elements[1] + g_followDir.elements[1],
            camPos.elements[2] + g_followDir.elements[2]
        ]);

        g_camWorldPos = camPos;

        return new Matrix4().setLookAt(camPos, center, UP);
    }

    // Default is free camera
    const yaw = Math.PI * g_yaw / 180.0;
    const pitch = Math.PI * g_pitch / 180.0;

    const cosx = Math.cos(pitch);
    const sinx = Math.sin(pitch);
    const cosy = Math.cos(yaw);
    const siny = Math.sin(yaw);

    const fwd = new Vector3([cosy * cosx, sinx, siny * cosx]);

    let up = new Vector3([0, 1, 0]);

    let right = fwd.cross(UP);
    if (right.length < 1e-6)
    {
        const ZUP = new Vector3([0, 0, 1]);
        right = fwd.cross(ZUP);
    }

    right.normalize();
    const LUP = right.cross(fwd).normalize();
    const center = new Vector3([
        g_camPos.elements[0] + fwd.elements[0],
        g_camPos.elements[1] + fwd.elements[1],
        g_camPos.elements[2] + fwd.elements[2]
    ]);

    g_camWorldPos = new Vector3([
        g_camPos.elements[0],
        g_camPos.elements[1],
        g_camPos.elements[2]
    ]);

    return new Matrix4().setLookAt(g_camPos, center, LUP);
}


/**
 * Build the projection matrix
 * based on g_usePerspective and the canvas aspect
 */
function calculateProjectionMatrix() 
{
    const aspect = g_canvas.width / g_canvas.height;
    const P = new Matrix4();
    P.setPerspective(g_fovDeg, aspect, g_near, g_far);
    return P;
}

/**
 * Helper function to setup key binding logic
 */
function setupKeyBinds() {
    // Setup the dictionary of keys we're tracking
    KEYS_TO_TRACK.forEach(key => {
        g_keysPressed[key] = false;
    });

    // Set key flag to true when key starts being pressed
    document.addEventListener('keydown', function (event) {
        KEYS_TO_TRACK.forEach(key => {
            if (event.key == key) {
                g_keysPressed[key] = true;
            }
        })

        // 'f' key is used to fix the camera
        if (event.key === 'f')
        {
            follow_chase = !follow_chase;

            if (follow_chase)
            {
                follow_target = 'boat';
                g_followDir = null;
            }
        }

        if (follow_chase) 
        {
            if (event.key === 'a') 
            {
                follow_target = 'hammer';
            }
            else if (event.key === 's')
            {
                follow_target = 'white';
            }
            else if (event.key === 'd')
            {
                follow_target = 'shark';
            }
            else if (event.key === 'w')
            {
                follow_target = 'boat';
            }
        }
    })

    // Set key flag to false when key starts being pressed
    document.addEventListener('keyup', function (event) {
        KEYS_TO_TRACK.forEach(key => {
            if (event.key == key) {
                g_keysPressed[key] = false;
            }
        });
    })
}

/**
 * Helper to construct colors to make meshes look more 3D
 * Makes every triangle a slightly different shade of blue
 * @param {int} vertexCount how many vertices to build colors for
 * @returns {Array<float>} a flat array of colors
 */
function buildColorAttributes(vertexCount) {
    let colors = [];
    for (let i = 0; i < vertexCount / 3; i++) {
        // three vertices per triangle
        for (let vert = 0; vert < 3; vert++) {
            let shade = (i * 3) / vertexCount;
            colors.push(shade, shade, 1.0);
        }
    }
    return colors;
}

// Build per-vertex colors for sharks, blue and white
// minY/maxY are from the shark's vertex bounds
function buildSharkColorsFromY(mesh, minY, maxY) {
    const colors = [];
    const rangeY = (maxY > minY) ? (maxY - minY) : 1.0;

    const blue = [0.19, 0.19, 0.19];
    const white = [0.89, 0.89, 0.89];

    // loop vertices
    for (let i = 0; i < mesh.length; i += 3) 
    {
        const y = mesh[i + 1];

        let t = (y - minY) / rangeY;

        // mix
        const r = white[0] * (1.0 - t) + blue[0] * t;
        const g = white[1] * (1.0 - t) + blue[1] * t;
        const b = white[2] * (1.0 - t) + blue[2] * t;

        colors.push(r, g, b);
    }
    return colors;
}

function analyzeMeshAndColors(mesh) 
{
    let minX= Infinity, maxX=-Infinity;
    let minY= Infinity, maxY=-Infinity;
    let minZ= Infinity, maxZ=-Infinity;

    for (let i = 0; i < mesh.length; i += 3) {
        const x = mesh[i], y = mesh[i+1], z = mesh[i+2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    const spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;

    // Choose body axis
    let longMask = [0,0,0], latMask = [0,0,0];
    let minAlong = minX, invRangeAlong = spanX > 0 ? 1/spanX : 0;

    if (spanZ >= spanX && spanZ >= spanY) {
        longMask = [0,0,1]; latMask = [1,0,0];
        minAlong = minZ; invRangeAlong = spanZ > 0 ? 1/spanZ : 0;
    } else if (spanY >= spanX && spanY >= spanZ) {
        longMask = [0,1,0]; latMask = [1,0,0];
        minAlong = minY; invRangeAlong = spanY > 0 ? 1/spanY : 0;
    } else {
        longMask = [1,0,0]; latMask = [0,0,1];
        minAlong = minX; invRangeAlong = spanX > 0 ? 1/spanX : 0;
    }

    // build blue top
    const colors = buildSharkColorsFromY(mesh, minY, maxY);

    return { minAlong, invRangeAlong, longMask, latMask, colors };
}

// clamp func
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Parse boat OBJ (v, vt, f)
function parseBoatOBJ(objText, outPositions, outTexcoords)
{
    const tempPositions = [[0, 0, 0]];
    const tempTexcoords = [[0, 0]];

    const lines = objText.split('\n');
    for (let raw of lines) 
    {
        const line = raw.trim();
        if (line.length === 0 || line[0] === '#') continue;

        if (line.startsWith('v ')) 
        {
            const parts = line.split(/\s+/);
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            tempPositions.push([x, y, z]);
        } 
        else if (line.startsWith('vt '))
        {
            const parts = line.split(/\s+/);
            const u = parseFloat(parts[1]);
            const v = parseFloat(parts[2]);
            tempTexcoords.push([u, v]);
        }
        else if (line.startsWith('f '))
        {
            const parts = line.slice(2).trim().split(/\s+/);

            // Faces with 3, 4, or more vertices
            const indices = [];
            for (let p of parts)
            {
                const toks = p.split('/');
                const vi = parseInt(toks[0], 10);
                const vti = toks.length > 1 && toks[1] !== '' ? parseInt(toks[1], 10) : 0;
                indices.push({ vi, vti });
            }

            for (let i = 2; i < indices.length; i++)
            {
                const tri = [indices[0], indices[i - 1], indices[i]];
                for (const { vi, vti } of tri)
                {
                    const pos = tempPositions[vi];
                    const uv  = tempTexcoords[vti] || [0, 0];
                    outPositions.push(pos[0], pos[1], pos[2]);
                    outTexcoords.push(uv[0], uv[1]);
                }
            }
        }
    }
}


/**
 * Initialize the VBO with the provided data
 * Assumes we are going to have "static" (unchanging) data
 * @param {Float32Array} data 
 * @return {Boolean} true if the VBO was setup successfully, and false otherwise
 */
function initVBO(data) {
    // get the VBO handle
    let VBOloc = gl.createBuffer();
    if (!VBOloc) {
        console.error('Failed to create the vertex buffer object');
        return false;
    }

    // Bind the VBO to the GPU array and copy `data` into that VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    g_mainVBO = VBOloc;

    return true;
}

/**
 * Specifies properties of the given attribute on the GPU
 * @param {Number} length : the length of the vector (e.g. 3 for a Vector3);
 * @param {String} name : the name of the attribute in GLSL
 * @param {Number} stride : the stride in bytes
 * @param {Number} offset : the offset in bytes
 * @return {Boolean} true if the attribute was setup successfully, and false otherwise
 */
function setupVec(length, name, stride, offset) {
    // Get the attribute by name
    let attributeID = gl.getAttribLocation(gl.program, `${name}`);
    if (attributeID < 0) {
        console.error(`Failed to get the storage location of ${name}`);
        return false;
    }

    // Set how the GPU fills the a_Position letiable with data from the GPU 
    gl.vertexAttribPointer(attributeID, length, gl.FLOAT, false, stride, offset);
    gl.enableVertexAttribArray(attributeID);

    return true;
}

function getDirection(yawd, pitchd)
{
    const yaw = Math.PI * yawd / 180.0;
    const pitch = Math.PI * pitchd / 180.0;

    const cosx = Math.cos(pitch);
    const sinx = Math.sin(pitch);
    const cosy = Math.cos(yaw);
    const siny = Math.sin(yaw);

    const fwd = new Vector3([cosy * cosx, sinx, siny * cosx]);
    fwd.normalize()
    return fwd;
}

// Initialize skybox
function initSkybox(gl) 
{
    // Compile & link skybox program
    const vshader = loadShader(gl, gl.VERTEX_SHADER, BOX_VSHADER_SOURCE);
    const fshader = loadShader(gl, gl.FRAGMENT_SHADER, BOX_FSHADER_SOURCE);
    const program = gl.createProgram();
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) 
    {
        console.error('Failed to link skybox program:', gl.getProgramInfoLog(program));
        return;
    }

    g_skyboxProgram = program;

    // Cube positions for a unit cube
    const skyboxVertices = new Float32Array([
        // +X
        1, -1, -1,  1, -1,  1,  1,  1,  1,
        1, -1, -1,  1,  1,  1,  1,  1, -1,
        // -X
        -1, -1, -1, -1,  1,  1, -1, -1,  1,
        -1, -1, -1, -1,  1, -1, -1,  1,  1,
        // +Y
        -1, 1, -1,  1,  1, -1,  1,  1,  1,
        -1, 1, -1,  1,  1,  1, -1,  1,  1,
        // -Y
        -1, -1, -1,  1, -1,  1,  1, -1, -1,
        -1, -1, -1, -1, -1,  1,  1, -1,  1,
        // +Z
        -1, -1, 1, -1,  1,  1,  1,  1,  1,
        -1, -1, 1,  1,  1,  1,  1, -1,  1,
        // -Z
        -1, -1, -1,  1,  1, -1,  1, -1, -1,
        -1, -1, -1, -1,  1, -1,  1,  1, -1
    ]);

    g_skyboxVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, g_skyboxVBO);
    gl.bufferData(gl.ARRAY_BUFFER, skyboxVertices, gl.STATIC_DRAW);

    // Cubemap texture
    g_skyboxTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    const faces = [
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: 'resources/Left+X.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: 'resources/Right-X.png' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: 'resources/Up+Y.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: 'resources/Down-Y.png' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: 'resources/Front+Z.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: 'resources/Back-Z.png' },
    ];

    for (const face of faces) 
    {
        gl.texImage2D(face.target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    }

    let loadedFaces = 0;

    for (const face of faces) 
    {
        const {target, url} = face;

        // Placeholder
        gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

        const img = new Image();
        img.onload = function () 
        {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

            gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

            loadedFaces++;
            if (loadedFaces === 6) 
            {
                // Faces have loaded
                gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
        };
        img.src = url;
    }

    // Uniform locations
    gl.useProgram(g_skyboxProgram);
    g_skybox_uView = gl.getUniformLocation(g_skyboxProgram, 'u_View');
    g_skybox_uProj = gl.getUniformLocation(g_skyboxProgram, 'u_Projection');
    g_skybox_uSampler = gl.getUniformLocation(g_skyboxProgram, 'u_Skybox');
    gl.uniform1i(g_skybox_uSampler, 0);
}

// Parse the boat .mtl file to map material names to texture files
function parseBoatMTL(mtlText) 
{
    g_boatMaterialTextures = {};
    let currentMat = null;

    const lines = mtlText.split('\n');
    for (let raw of lines) 
    {
        const line = raw.trim();
        if (!line || line[0] === '#') continue;

        if (line.startsWith('newmtl ')) 
        {
            currentMat = line.substring(7).trim();
        } 
        else if (line.startsWith('map_Kd ') && currentMat)
        {
            const texPath = line.substring(7).trim();
            // Use the path as-is; make sure your images live where map_Kd points
            g_boatMaterialTextures[currentMat] = "resources/" + texPath;
        }
    }
}

// Parse OBJ with v, vt, f, usemtl and build per-material meshes
function parseBoatWithMaterials(objText) 
{
    g_boatMeshesByMaterial = {};

    const tempPositions = [[0, 0, 0]];
    const tempTexcoords = [[0, 0]];
    const tempNormals   = [[0, 1, 0]];

    let currentMat = 'default';

    function ensureMat(name) 
    {
        if (!g_boatMeshesByMaterial[name]) 
        {
            g_boatMeshesByMaterial[name] = {
                positions: [],
                texcoords: [],
                normals: [],
                vertexCount: 0,
            };
        }
        return g_boatMeshesByMaterial[name];
    }

    const lines = objText.split('\n');
    for (let raw of lines) 
    {
        const line = raw.trim();
        if (!line || line[0] === '#') continue;

        if (line.startsWith('v '))
        {
            const p = line.split(/\s+/);
            tempPositions.push([
                parseFloat(p[1]),
                parseFloat(p[2]),
                parseFloat(p[3]),
            ]);
        }
        else if (line.startsWith('vt '))
        {
            const p = line.split(/\s+/);
            const u = parseFloat(p[1]);
            const v = parseFloat(p[2]);
            tempTexcoords.push([u, v]);
        }
        else if (line.startsWith('vn '))
        {
            const p = line.split(/\s+/);
            const x = parseFloat(p[1]);
            const y = parseFloat(p[2]);
            const z = parseFloat(p[3]);
            tempNormals.push([x, y, z]);
        }
        else if (line.startsWith('usemtl '))
        {
            currentMat = line.substring(7).trim();
        }
        else if (line.startsWith('f '))
        {
            const parts = line.slice(2).trim().split(/\s+/);
            if (parts.length < 3) continue;

            const indices = [];
            for (let token of parts)
            {
                const toks = token.split('/');
                const vi  = parseInt(toks[0], 10);
                let vti = 0;
                let vni = 0;

                if (toks.length > 1 && toks[1] !== '' && token.indexOf('//') < 0)
                {
                    // v/vt or v/vt/vn
                    vti = parseInt(toks[1], 10);
                }

                if (toks.length === 3 && toks[2] !== '')
                {
                    // v/vt/vn
                    vni = parseInt(toks[2], 10);
                }
                else if (toks.length === 2 && token.indexOf('//') >= 0)
                {
                    // v//vn
                    vni = parseInt(toks[1], 10);
                }

                indices.push({ vi, vti, vni });
            }

            const matMesh = ensureMat(currentMat);

            for (let i = 2; i < indices.length; i++)
            {
                const tri = [indices[0], indices[i - 1], indices[i]];
                for (const { vi, vti, vni } of tri)
                {
                    const pos = tempPositions[vi];
                    const uv  = tempTexcoords[vti] || [0, 0];
                    const nor = tempNormals[vni] || tempNormals[0];

                    matMesh.positions.push(pos[0], pos[1], pos[2]);
                    matMesh.texcoords.push(uv[0], uv[1]);
                    matMesh.normals.push(nor[0], nor[1], nor[2]);
                    matMesh.vertexCount++;
                }
            }
        }
    }
}

function initBoatRendering(gl)
{
    // Compile & link boat program
    const vshader = loadShader(gl, gl.VERTEX_SHADER, BOAT_VSHADER_SOURCE);
    const fshader = loadShader(gl, gl.FRAGMENT_SHADER, BOAT_FSHADER_SOURCE);
    const program = gl.createProgram();
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    {
        console.error('Failed to link boat program:', gl.getProgramInfoLog(program));
        return;
    }
    g_boatProgram = program;

    g_boat_uModel = gl.getUniformLocation(g_boatProgram, 'u_Model');
    g_boat_uWorld = gl.getUniformLocation(g_boatProgram, 'u_World');
    g_boat_uCamera = gl.getUniformLocation(g_boatProgram, 'u_Camera');
    g_boat_uSampler = gl.getUniformLocation(g_boatProgram, 'u_Sampler');

    g_boat_uSunDir = gl.getUniformLocation(g_boatProgram, 'sunDirection');
    g_boat_uSunColor = gl.getUniformLocation(g_boatProgram, 'sunColor');
    g_boat_uEyePos = gl.getUniformLocation(g_boatProgram, 'eyePos');
    g_boat_uShiny = gl.getUniformLocation(g_boatProgram, 'uShiny');
    g_boat_uSpec = gl.getUniformLocation(g_boatProgram, 'uSpec');
    g_boat_uDiffuse = gl.getUniformLocation(g_boatProgram, 'uDiffuse');

    // Set moonlight defaults
    gl.useProgram(g_boatProgram);
    const moonDirB = new Vector3([0.0, 0.6, 1.0]);
    moonDirB.normalize();
    gl.uniform3f(g_boat_uSunDir, moonDirB.elements[0], moonDirB.elements[1], moonDirB.elements[2]);
    gl.uniform3f(g_boat_uSunColor, 0.6, 0.7, 1.0);
    gl.uniform1f(g_boat_uShiny, 64.0);
    gl.uniform1f(g_boat_uSpec, 0.8);
    gl.uniform1f(g_boat_uDiffuse, 0.7);
    gl.useProgram(gl.program); 

    g_boatSubmeshes = [];

    const matNames = Object.keys(g_boatMeshesByMaterial);
    matNames.forEach((matName) => {
        const mesh = g_boatMeshesByMaterial[matName];
        if (!mesh || mesh.vertexCount === 0) return;

        const verts = mesh.vertexCount;
        const interleaved = new Float32Array(verts * 8);
        for (let i = 0; i < verts; i++)
        {
            interleaved[i * 8 + 0] = mesh.positions[i * 3 + 0];
            interleaved[i * 8 + 1] = mesh.positions[i * 3 + 1];
            interleaved[i * 8 + 2] = mesh.positions[i * 3 + 2];

            interleaved[i * 8 + 3] = mesh.normals[i * 3 + 0];
            interleaved[i * 8 + 4] = mesh.normals[i * 3 + 1];
            interleaved[i * 8 + 5] = mesh.normals[i * 3 + 2];

            interleaved[i * 8 + 6] = mesh.texcoords[i * 2 + 0];
            interleaved[i * 8 + 7] = mesh.texcoords[i * 2 + 1];
        }

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

        const texPath = g_boatMaterialTextures[matName];
        let texture;

        if (texPath)
        {
            // Load real texture
            texture = gl.createTexture();
            const image = new Image();
            image.onload = function () {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            };
            image.src = texPath;
        }
        else
        {
            // Only for white color and grey
            if (matName === 'white')
            {
                texture = createSolidTexture(gl, 1.0, 1.0, 1.0, 1.0);
            } 
            else
            {
                texture = createSolidTexture(gl, 0.3, 0.3, 0.3, 1.0);
            }
        }

        g_boatSubmeshes.push({
            material: matName,
            vbo: vbo,
            vertexCount: verts,
            texture: texture,
        });
    });
}


function createSolidTexture(gl, r, g, b, a)
{
    // This is for colors, which are not included in the diffuse texture files
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const data = new Uint8Array([
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
        Math.round(a * 255),
    ]);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return tex;
}

// Decompose into local matrix and world positions (for boat consistency)
function decomposeMatrixToPosAndLocal(mat)
{
    const e = mat.elements;
    const pos = {x: e[12], y: e[13], z: e[14]};
    const local = new Matrix4(mat);
    local.elements[12] = 0.0;
    local.elements[13] = 0.0;
    local.elements[14] = 0.0;
    return {pos, local};
}

// Build matrix from world pos and local matrix
function buildModelFromPosAndLocal(x, y, z, localMat) 
{
    const m = new Matrix4();
    m.setIdentity();
    m.translate(x, y, z);
    m.multiply(localMat);
    return m;
}

// Move forward boat so that they interact with terrain
// They move relative to terrain height
// Move forward boat so that they interact with terrain
// They move relative to terrain height + gentle rocking
function updateMotion(sec)
{
    // Move forward
    g_pathParam += PATH_SPEED * sec;

    // Teleport before getting to edge
    if (g_pathParam > PATH_LENGTH) 
    {
        g_pathParam = 0.0;
    }

    const dz = g_pathParam;

    // Boat pos and rocking
    if (g_boatStartPos && g_boatLocalMatrix)
    {
        const x = g_boatStartPos.x;
        const z = g_boatStartPos.z + dz;
        const h = g_boatHeightOffset - 0.15;

        // Rocking is independent of frame rate
        const t = g_totalTimeSec;

        // Angles
        const rollAmpDeg = 3.0;
        const pitchAmpDeg = 4.0;
        const rollFreqHz = 0.45;
        const pitchFreqHz = 0.50;

        // Convert to angles
        const rollDeg = rollAmpDeg * Math.sin(2.0 * Math.PI * rollFreqHz * t);
        const pitchDeg = pitchAmpDeg * Math.sin(2.0 * Math.PI * pitchFreqHz * t + 1.2);

        // Local matrix that adds rocking on top of the original boat local transform
        const localWithRock = new Matrix4();
        localWithRock.setIdentity();
        localWithRock.rotate(pitchDeg, 1, 0, 0);
        localWithRock.rotate(rollDeg, 0, 0, 1);
        localWithRock.multiply(g_boatLocalMatrix);

        g_boatModelMatrix = buildModelFromPosAndLocal(x, h, z, localWithRock);
    }
}


function initWater(gl)
{
    // Compile & link water program
    const vshader = loadShader(gl, gl.VERTEX_SHADER, WATER_VSHADER_SOURCE);
    const fshader = loadShader(gl, gl.FRAGMENT_SHADER, WATER_FSHADER_SOURCE);
    const program = gl.createProgram();
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) 
    {
        console.error('Failed to link water program:', gl.getProgramInfoLog(program));
        return;
    }
    g_waterProgram = program;

    g_water_uModel = gl.getUniformLocation(program, 'u_Model');
    g_water_uWorld = gl.getUniformLocation(program, 'u_World');
    g_water_uCamera = gl.getUniformLocation(program, 'u_Camera');
    g_water_uTime = gl.getUniformLocation(program, 'time');
    g_water_uNormalSampler = gl.getUniformLocation(program, 'normalSampler');

    g_water_uSunDir = gl.getUniformLocation(program, 'sunDirection');
    g_water_uSunColor = gl.getUniformLocation(program, 'sunColor');
    g_water_uEyePos = gl.getUniformLocation(program, 'eyePos');
    g_water_uShiny = gl.getUniformLocation(program, 'uShiny');
    g_water_uSpec = gl.getUniformLocation(program, 'uSpec');
    g_water_uDiffuse = gl.getUniformLocation(program, 'uDiffuse');

    g_water_uReflectionTex = gl.getUniformLocation(program, 'u_ReflectionTex');
    g_water_uReflectionVP = gl.getUniformLocation(program, 'u_ReflectionVP');

    // Skybox sampler
    g_water_uSkybox = gl.getUniformLocation(program, 'u_Skybox');
    gl.useProgram(g_waterProgram);

    const moonDirW = new Vector3([0.0, 0.6, 1.0]);
    moonDirW.normalize();
    if (g_water_uSunDir) 
    {
        gl.uniform3f(g_water_uSunDir, moonDirW.elements[0], moonDirW.elements[1], moonDirW.elements[2]);
    }
    if (g_water_uSunColor) 
    {
        gl.uniform3f(g_water_uSunColor, 0.6, 0.7, 1.0);
    }
    if (g_water_uShiny) gl.uniform1f(g_water_uShiny, 64.0);
    if (g_water_uSpec) gl.uniform1f(g_water_uSpec, 0.8);
    if (g_water_uDiffuse) gl.uniform1f(g_water_uDiffuse, 0.7);

    if (g_water_uReflectionTex) 
    {
        gl.uniform1i(g_water_uReflectionTex, 1); 
    }

    if (g_water_uSkybox) 
    {
        gl.uniform1i(g_water_uSkybox, 2);
    }

    gl.useProgram(gl.program);

    const halfWidth = 400;
    const halfLength = 400; 

    const verts = new Float32Array([
        -halfWidth, 0.0, -halfLength, 0.0, 0.0,
        halfWidth, 0.0, -halfLength, 1.0, 0.0,
        halfWidth, 0.0, halfLength, 1.0, halfLength * 0.05,
        -halfWidth, 0.0, -halfLength, 0.0, 0.0,
        halfWidth, 0.0, halfLength, 1.0, halfLength * 0.05,
        -halfWidth, 0.0, halfLength, 0.0, halfLength * 0.05
    ]);

    g_waterVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, g_waterVBO);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    g_waterVertexCount = 6;

    // Load normal map for waves
    g_waterTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_waterTexture);

    // Placeholder while image loads
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA,
        1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 255, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const img = new Image();
    img.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, g_waterTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                      gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };

    img.src = 'resources/waternormal.jpg';
}

function drawWater(V, P)
{
    if (!g_waterProgram || !g_waterVBO || !g_waterTexture) return;

    gl.useProgram(g_waterProgram);

    const PV = new Matrix4(P).multiply(V);
    gl.uniformMatrix4fv(g_water_uCamera, false, PV.elements);
    gl.uniformMatrix4fv(g_water_uWorld, false, g_worldMatrix.elements);

    // Flat plane at y = 0
    const model = new Matrix4();
    gl.uniformMatrix4fv(g_water_uModel, false, model.elements);

    gl.uniform1f(g_water_uTime, g_totalTimeSec);

    // Eye position for water Fresnel
    if (g_water_uEyePos)
    {
        const eye = g_camWorldPos.elements;
        gl.uniform3f(g_water_uEyePos, eye[0], eye[1], eye[2]);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, g_waterVBO);
    const stride = 5 * FLOAT_SIZE;

    const aPos = gl.getAttribLocation(g_waterProgram, 'a_Position');
    const aTex = gl.getAttribLocation(g_waterProgram, 'a_TexCoord');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, stride, 3 * FLOAT_SIZE);

    // Normal map on texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g_waterTexture);
    gl.uniform1i(g_water_uNormalSampler, 0);

    // Planar reflection on texture unit 1
    if (g_reflectionTex && g_water_uReflectionTex && g_water_uReflectionVP && g_reflectVP)
    {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, g_reflectionTex);
        gl.uniformMatrix4fv(g_water_uReflectionVP, false, g_reflectVP.elements);
    }

    // Skybox cubemap on texture unit 2
    if (g_skyboxTexture && g_water_uSkybox)
    {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);
    }

    gl.drawArrays(gl.TRIANGLES, 0, g_waterVertexCount);
}


// Parse sharks to get normals
function readSharks(objText, outPositions, outNormals)
{
    const tempPositions = [[0, 0, 0]];
    const tempNormals   = [[0, 1, 0]];

    const lines = objText.split('\n');
    for (let raw of lines)
    {
        const line = raw.trim();
        if (!line || line[0] === '#') continue;

        if (line.startsWith('v '))
        {
            const p = line.split(/\s+/);
            const x = parseFloat(p[1]);
            const y = parseFloat(p[2]);
            const z = parseFloat(p[3]);
            tempPositions.push([x, y, z]);
        }
        else if (line.startsWith('vn '))
        {
            const p = line.split(/\s+/);
            const x = parseFloat(p[1]);
            const y = parseFloat(p[2]);
            const z = parseFloat(p[3]);
            tempNormals.push([x, y, z]);
        }
        else if (line.startsWith('f '))
        {
            const parts = line.slice(2).trim().split(/\s+/);
            if (parts.length < 3) continue;

            const indices = [];
            for (let token of parts)
            {
                const toks = token.split('/');
                const vi = parseInt(toks[0], 10);
                let vni = 0;

                if (toks.length === 3 && toks[2] !== '')
                {
                    // v/vt/vn
                    vni = parseInt(toks[2], 10);
                }
                else if (toks.length === 2 && token.indexOf('//') >= 0)
                {
                    // v//vn 
                    vni = parseInt(toks[1], 10);
                }

                indices.push({ vi, vni });
            }

            for (let i = 2; i < indices.length; i++)
            {
                const tri = [indices[0], indices[i - 1], indices[i]];
                for (const { vi, vni } of tri)
                {
                    const pos = tempPositions[vi];
                    const nor = tempNormals[vni] || tempNormals[0];

                    outPositions.push(pos[0], pos[1], pos[2]);
                    outNormals.push(nor[0], nor[1], nor[2]);
                }
            }
        }
    }
}

function initReflectionFramebuffer(gl)
{
    const width  = gl.canvas.width;
    const height = gl.canvas.height;

    g_reflectionFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, g_reflectionFBO);

    // Color texture
    g_reflectionTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_reflectionTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                  width, height, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Depth buffer
    g_reflectionDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, g_reflectionDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, g_reflectionTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
                               gl.RENDERBUFFER, g_reflectionDepth);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) 
    {
        console.error('Reflection framebuffer incomplete:', status.toString(16));
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
}

function drawBoatWithPV(PV, eyeArray)
{
    if (!g_boatProgram || !g_boatSubmeshes || g_boatSubmeshes.length === 0 || !g_boatModelMatrix)
    {
        return;
    }

    gl.useProgram(g_boatProgram);

    // Eye position for boat lighting
    gl.uniform3f(g_boat_uEyePos, eyeArray[0], eyeArray[1], eyeArray[2]);

    // Camera and transforms for boat program
    gl.uniformMatrix4fv(g_boat_uModel, false, g_boatModelMatrix.elements);
    gl.uniformMatrix4fv(g_boat_uWorld, false, g_worldMatrix.elements);
    gl.uniformMatrix4fv(g_boat_uCamera, false, PV.elements);

    const stride = 8 * FLOAT_SIZE;

    g_boatSubmeshes.forEach((sub) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, sub.vbo);

        const aPos = gl.getAttribLocation(g_boatProgram, 'a_Position');
        const aNorm = gl.getAttribLocation(g_boatProgram, 'a_Normal');
        const aTex = gl.getAttribLocation(g_boatProgram, 'a_TexCoord');

        gl.enableVertexAttribArray(aPos);
        gl.enableVertexAttribArray(aNorm);
        gl.enableVertexAttribArray(aTex);

        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, stride, 3 * FLOAT_SIZE);
        gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, stride, 6 * FLOAT_SIZE);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sub.texture);
        gl.uniform1i(g_boat_uSampler, 0);

        gl.drawArrays(gl.TRIANGLES, 0, sub.vertexCount);
    });

    gl.useProgram(gl.program);
}

function drawReflection(P, V)
{
    if (!g_reflectionFBO || !g_boatProgram || g_boatSubmeshes.length === 0) 
    {
        return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, g_reflectionFBO);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Reflection matrix across y = 0
    const reflectMat = new Matrix4();
    reflectMat.setIdentity();
    const re = reflectMat.elements;
    re[5] = -1.0;

    // V_reflect = V * reflect
    const V_reflect = new Matrix4(V).multiply(reflectMat);
    g_reflectVP = new Matrix4(P).multiply(V_reflect);

    // Reflect camera eye position
    const eye = g_camWorldPos.elements;
    const eyeRef = [eye[0], -eye[1], eye[2]];

    // Draw boat into reflection texture
    if (g_boatProgram && g_boatSubmeshes && g_boatSubmeshes.length > 0) 
    {
        drawBoatWithPV(g_reflectVP, eyeRef);
    }

    // Shark reflections
    drawSharksWithPV(g_reflectVP, eyeRef);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function drawSharksWithPV(PV, eyeArray)
{
    gl.useProgram(gl.program);

    // Bind main VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, g_mainVBO);

    const posFloatLen = g_sharkMesh.length + g_hammerMesh.length + g_whiteMesh.length;
    const normFloatLen = g_sharkNormals.length + g_hammerNormals.length + g_whiteNormals.length;
    const normalByteOffset = posFloatLen * FLOAT_SIZE;
    const colorByteOffset = (posFloatLen + normFloatLen) * FLOAT_SIZE;

    // Attributes
    setupVec(3, 'a_Position', 0, 0);
    setupVec(3, 'a_Normal', 0, normalByteOffset);
    setupVec(3, 'a_Color', 0, colorByteOffset);

    // Reflection camera
    gl.uniformMatrix4fv(g_uCamera_ref, false, PV.elements);
    gl.uniformMatrix4fv(g_uWorld_ref, false, g_worldMatrix.elements);

    gl.uniform3f(g_uEyePos_ref, eyeArray[0], eyeArray[1], eyeArray[2]);

    // Swim params 
    const AMP = 0.6;
    const K   = 0.20;
    const SPD = 4.0;
    const TW  = 0.45;

    // Reef Shark
    gl.uniformMatrix4fv(g_uModel_ref, false, g_modelMatrixShark.elements);
    gl.uniform1f(g_uTime_ref, g_totalTimeSec);
    gl.uniform4f(g_uWave_ref, AMP, K, SPD, TW);
    gl.uniform2f(g_uBounds_ref, g_sharkMinAlong, g_sharkInvRangeAlong);
    gl.uniform3f(g_uLongMask_ref, g_sharkLongMask[0], g_sharkLongMask[1], g_sharkLongMask[2]);
    gl.uniform3f(g_uLatMask_ref,   g_sharkLatMask[0],  g_sharkLatMask[1],  g_sharkLatMask[2]);
    gl.uniform1i(g_uSwimEnable_ref, 1);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.sharkOffset, g_sharkVertCount);

    // White-tipped
    gl.uniformMatrix4fv(g_uModel_ref, false, g_modelMatrixWhite.elements);
    gl.uniformMatrix4fv(g_uWorld_ref, false, g_worldMatrix.elements);
    gl.uniform1i(g_uSwimEnable_ref, 0);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.whiteOffset, g_whiteVertCount);

    // Hammerhead 
    const hammerModelNow = new Matrix4(g_modelMatrixHammer).translate(0, g_hammerYOffset, 0);
    gl.uniformMatrix4fv(g_uModel_ref, false, hammerModelNow.elements);
    gl.uniform1i(g_uSwimEnable_ref, 0);

    gl.drawArrays(gl.TRIANGLES, g_drawOffsets.hammerOffset, g_hammerVertCount);
}
