import * as THREE from 'three';

// Game State
let gameStarted = false;
let flashlightOn = false;
let batteryLevel = 100;
let health = 100;
let fearLevel = 0;
let hasKey = false;
let chapterComplete = false;

// Camera and Player
let camera, scene, renderer;
let playerVelocity = new THREE.Vector3();
let playerDirection = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isRunning = false;
let canMove = true;

// Ghosts
const ghosts = [];
const ghostPatrolPoints = [];

// Objects
const interactableObjects = [];
let emergencyKey = null;

// Audio Context
let audioContext;
let heartbeatSound = null;

// Initialize the game
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.03);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting
    createLighting();

    // Build Office Environment
    buildOffice();

    // Create Ghosts
    createGhosts();

    // Event Listeners
    setupEventListeners();

    // Start animation loop
    animate();
}

function createLighting() {
    // Ambient light (very dim - emergency lighting)
    const ambientLight = new THREE.AmbientLight(0x330000, 0.3);
    scene.add(ambientLight);

    // Emergency red lights
    for (let i = 0; i < 10; i++) {
        const emergencyLight = new THREE.PointLight(0xff0000, 0.5, 15);
        emergencyLight.position.set(
            Math.random() * 40 - 20,
            3 + Math.random() * 2,
            Math.random() * 40 - 20
        );
        emergencyLight.castShadow = true;
        
        // Flicker effect
        setInterval(() => {
            emergencyLight.intensity = Math.random() > 0.3 ? 0.5 : 0.1;
        }, 100 + Math.random() * 200);
        
        scene.add(emergencyLight);
    }

    // Flashlight (attached to camera)
    const flashlight = new THREE.SpotLight(0xffffff, 0);
    flashlight.position.set(0, 0, 0);
    flashlight.angle = Math.PI / 6;
    flashlight.penumbra = 0.3;
    flashlight.distance = 30;
    flashlight.castShadow = true;
    camera.add(flashlight);
    camera.flashlight = flashlight;
    scene.add(camera);
}

function buildOffice() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(50, 50);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0a0a0a,
        roughness: 0.9
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4;
    scene.add(ceiling);

    // Walls
    createWalls();

    // Desks and Office Furniture
    createDesks();

    // Windows with rain effect
    createWindows();

    // Doors
    createDoors();

    // Emergency Stair Door (goal)
    createEmergencyDoor();

    // Place the key
    placeEmergencyKey();
}

function createWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2a2a2a,
        roughness: 0.9
    });

    // Outer walls
    const walls = [
        { pos: [0, 2, -25], size: [50, 4, 1] },
        { pos: [0, 2, 25], size: [50, 4, 1] },
        { pos: [-25, 2, 0], size: [1, 4, 50] },
        { pos: [25, 2, 0], size: [1, 4, 50] }
    ];

    walls.forEach(wall => {
        const geometry = new THREE.BoxGeometry(...wall.size);
        const mesh = new THREE.Mesh(geometry, wallMaterial);
        mesh.position.set(...wall.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });

    // Internal office partitions
    const partitions = [
        { pos: [-10, 2, 0], size: [1, 3, 20] },
        { pos: [10, 2, 0], size: [1, 3, 20] },
        { pos: [0, 2, -10], size: [15, 3, 1] },
        { pos: [0, 2, 10], size: [15, 3, 1] }
    ];

    partitions.forEach(partition => {
        const geometry = new THREE.BoxGeometry(...partition.size);
        const mesh = new THREE.Mesh(geometry, wallMaterial);
        mesh.position.set(...partition.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });
}

function createDesks() {
    const deskMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3d2817,
        roughness: 0.7
    });

    const chairMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.8
    });

    // Create multiple desks
    for (let i = 0; i < 15; i++) {
        const x = (Math.random() - 0.5) * 40;
        const z = (Math.random() - 0.5) * 40;
        
        // Desk
        const deskGeometry = new THREE.BoxGeometry(2, 0.8, 1);
        const desk = new THREE.Mesh(deskGeometry, deskMaterial);
        desk.position.set(x, 0.8, z);
        desk.castShadow = true;
        desk.receiveShadow = true;
        scene.add(desk);

        // Computer monitor
        const monitorGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.1);
        const monitorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0a0a0a,
            emissive: Math.random() > 0.7 ? 0x111111 : 0x000000,
            emissiveIntensity: 0.2
        });
        const monitor = new THREE.Mesh(monitorGeometry, monitorMaterial);
        monitor.position.set(x, 1.4, z);
        scene.add(monitor);

        // Chair
        const chairGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
        const chair = new THREE.Mesh(chairGeometry, chairMaterial);
        chair.position.set(x + 1, 0.4, z);
        chair.castShadow = true;
        scene.add(chair);
    }
}

function createWindows() {
    const windowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e,
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.7
    });

    // Large windows on one side
    for (let i = 0; i < 5; i++) {
        const windowGeometry = new THREE.PlaneGeometry(4, 3);
        const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
        windowMesh.position.set(25, 2, -15 + i * 7);
        windowMesh.rotation.y = -Math.PI / 2;
        scene.add(windowMesh);

        // Window frame
        const frameGeometry = new THREE.BoxGeometry(0.2, 3.2, 4.2);
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        frame.position.set(25.1, 2, -15 + i * 7);
        frame.rotation.y = -Math.PI / 2;
        scene.add(frame);
    }
}

function createDoors() {
    const doorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3d2817,
        roughness: 0.8
    });

    // Several office doors
    const doorPositions = [
        [-25, 1.5, -5],
        [-25, 1.5, 5],
        [25, 1.5, -5],
        [25, 1.5, 5]
    ];

    doorPositions.forEach(pos => {
        const doorGeometry = new THREE.BoxGeometry(0.2, 3, 1.5);
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(...pos);
        if (pos[0] < 0) door.rotation.y = Math.PI / 2;
        else door.rotation.y = -Math.PI / 2;
        door.castShadow = true;
        scene.add(door);
    });
}

function createEmergencyDoor() {
    const doorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8b0000,
        roughness: 0.6,
        emissive: 0x330000,
        emissiveIntensity: 0.3
    });

    const doorGeometry = new THREE.BoxGeometry(0.3, 3.5, 2);
    emergencyKey = new THREE.Mesh(doorGeometry, doorMaterial);
    emergencyKey.position.set(-24, 1.75, 20);
    emergencyKey.rotation.y = Math.PI / 2;
    emergencyKey.castShadow = true;
    emergencyKey.userData = { type: 'emergencyDoor', interactable: true };
    scene.add(emergencyKey);

    // Exit sign above door
    const signGeometry = new THREE.BoxGeometry(1.5, 0.3, 0.1);
    const signMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5
    });
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(-24, 3.5, 20);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);
}

function placeEmergencyKey() {
    // Key on a desk
    const keyGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.1);
    const keyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffd700,
        metalness: 0.9,
        roughness: 0.2
    });
    const key = new THREE.Mesh(keyGeometry, keyMaterial);
    key.position.set(10, 1.05, -10);
    key.rotation.y = Math.PI / 4;
    key.userData = { type: 'key', interactable: true };
    scene.add(key);
    interactableObjects.push(key);

    // Add a glow effect
    const keyLight = new THREE.PointLight(0xffd700, 0.5, 3);
    keyLight.position.set(10, 1.5, -10);
    scene.add(keyLight);
}

function createGhosts() {
    // Ghost 1: The Broken Head
    const ghost1Geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
    const ghost1Material = new THREE.MeshStandardMaterial({ 
        color: 0x8b0000,
        roughness: 0.9,
        transparent: true,
        opacity: 0.8
    });
    const ghost1 = new THREE.Mesh(ghost1Geometry, ghost1Material);
    ghost1.position.set(-15, 0.9, 15);
    ghost1.userData = { 
        type: 'ghost', 
        id: 1, 
        name: 'The Broken Head',
        speed: 0.02,
        patrolIndex: 0
    };
    scene.add(ghost1);
    ghosts.push(ghost1);

    // Ghost 2: The Acid Mouth
    const ghost2Geometry = new THREE.CapsuleGeometry(0.4, 1.5, 4, 8);
    const ghost2Material = new THREE.MeshStandardMaterial({ 
        color: 0x006400,
        roughness: 0.7,
        transparent: true,
        opacity: 0.7
    });
    const ghost2 = new THREE.Mesh(ghost2Geometry, ghost2Material);
    ghost2.position.set(15, 0.9, -15);
    ghost2.userData = { 
        type: 'ghost', 
        id: 2, 
        name: 'The Acid Mouth',
        speed: 0.015,
        patrolIndex: 0
    };
    scene.add(ghost2);
    ghosts.push(ghost2);

    // Ghost 3: The Ceiling Crawler
    const ghost3Geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const ghost3Material = new THREE.MeshStandardMaterial({ 
        color: 0x4b0082,
        roughness: 0.5,
        transparent: true,
        opacity: 0.6,
        emissive: 0x220033,
        emissiveIntensity: 0.5
    });
    const ghost3 = new THREE.Mesh(ghost3Geometry, ghost3Material);
    ghost3.position.set(0, 3.5, 0);
    ghost3.userData = { 
        type: 'ghost', 
        id: 3, 
        name: 'The Ceiling Crawler',
        speed: 0.025,
        patrolIndex: 0,
        onCeiling: true
    };
    scene.add(ghost3);
    ghosts.push(ghost3);

    // Setup patrol points
    ghostPatrolPoints.push(
        new THREE.Vector3(-15, 0.9, 15),
        new THREE.Vector3(15, 0.9, 15),
        new THREE.Vector3(15, 0.9, -15),
        new THREE.Vector3(-15, 0.9, -15)
    );
}

function setupEventListeners() {
    // Start button
    document.getElementById('start-button').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        gameStarted = true;
        startAudio();
        document.body.requestPointerLock();
    });

    // Keyboard controls
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyD': moveRight = true; break;
            case 'ShiftLeft': isRunning = true; break;
            case 'KeyE': interact(); break;
            case 'Space': 
                if (!event.repeat) toggleFlashlight(); 
                break;
        }
    });

    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyD': moveRight = false; break;
            case 'ShiftLeft': isRunning = false; break;
        }
    });

    // Mouse look
    document.addEventListener('mousemove', (event) => {
        if (gameStarted && document.pointerLockElement === document.body) {
            camera.rotation.y -= event.movementX * 0.002;
            camera.rotation.x -= event.movementY * 0.002;
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        }
    });

    // Click for flashlight
    document.addEventListener('mousedown', () => {
        if (gameStarted) {
            toggleFlashlight();
        }
    });

    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    camera.flashlight.intensity = flashlightOn ? 2 : 0;
    
    // Drain battery when flashlight is on
    if (flashlightOn) {
        setInterval(() => {
            if (flashlightOn && batteryLevel > 0) {
                batteryLevel -= 0.5;
                updateUI();
                
                if (batteryLevel <= 0) {
                    flashlightOn = false;
                    camera.flashlight.intensity = 0;
                }
            }
        }, 100);
    }
}

function interact() {
    if (!canMove) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const intersects = raycaster.intersectObjects(interactableObjects);
    
    if (intersects.length > 0 && intersects[0].distance < 3) {
        const object = intersects[0].object;
        
        if (object.userData.type === 'key') {
            hasKey = true;
            scene.remove(object);
            interactableObjects.splice(interactableObjects.indexOf(object), 1);
            document.getElementById('objective-text').textContent = 'Objective: Use the key on the emergency exit door';
            
            // Play pickup sound
            playSound('pickup');
        }
    }

    // Check emergency door
    if (emergencyKey && hasKey && !chapterComplete) {
        const distance = camera.position.distanceTo(emergencyKey.position);
        if (distance < 3) {
            completeChapter();
        }
    }
}

function completeChapter() {
    chapterComplete = true;
    canMove = false;
    document.exitPointerLock();
    
    setTimeout(() => {
        document.getElementById('chapter-end').style.display = 'flex';
    }, 1000);
}

function startAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create heartbeat sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 1;
        oscillator.type = 'sine';
        gainNode.gain.value = 0;
        
        oscillator.start();
        heartbeatSound = { oscillator, gainNode };
        
        // Update heartbeat based on fear
        setInterval(updateHeartbeat, 1000);
    } catch (e) {
        console.log('Audio not supported');
    }
}

function updateHeartbeat() {
    if (heartbeatSound && gameStarted) {
        const rate = 60 + fearLevel * 30;
        heartbeatSound.oscillator.frequency.value = rate / 60;
        
        // Pulse
        const time = audioContext.currentTime;
        heartbeatSound.gainNode.gain.setValueAtTime(0.1, time);
        heartbeatSound.gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    }
}

function playSound(type) {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch (type) {
        case 'pickup':
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.2);
            break;
        case 'footstep':
            oscillator.frequency.value = 100;
            gainNode.gain.value = 0.05;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.stop(audioContext.currentTime + 0.1);
            break;
    }
}

function updateGhosts() {
    if (!gameStarted || chapterComplete) return;

    ghosts.forEach((ghost, index) => {
        const patrolPoint = ghostPatrolPoints[ghost.userData.patrolIndex];
        const direction = new THREE.Vector3().subVectors(patrolPoint, ghost.position);
        
        if (direction.length() < 0.5) {
            ghost.userData.patrolIndex = (ghost.userData.patrolIndex + 1) % ghostPatrolPoints.length;
        } else {
            direction.normalize();
            ghost.position.add(direction.multiplyScalar(ghost.userData.speed));
        }

        // Check distance to player
        const distanceToPlayer = ghost.position.distanceTo(camera.position);
        
        if (distanceToPlayer < 5) {
            fearLevel = Math.min(100, fearLevel + 0.5);
            
            // Ghost becomes aggressive
            if (distanceToPlayer < 2 && flashlightOn) {
                ghost.userData.speed *= 1.5;
            }
        } else {
            fearLevel = Math.max(0, fearLevel - 0.1);
        }

        // Update heartbeat overlay
        document.getElementById('heartbeat-overlay').style.opacity = fearLevel / 200;
    });
}

function updatePlayer() {
    if (!canMove || !gameStarted || chapterComplete) return;

    const speed = isRunning ? 0.15 : 0.08;
    
    playerDirection.z = Number(moveForward) - Number(moveBackward);
    playerDirection.x = Number(moveRight) - Number(moveLeft);
    playerDirection.normalize();

    if (moveForward || moveBackward) {
        playerVelocity.z = playerDirection.z * speed;
    } else {
        playerVelocity.z = 0;
    }

    if (moveLeft || moveRight) {
        playerVelocity.x = playerDirection.x * speed;
    } else {
        playerVelocity.x = 0;
    }

    // Apply movement relative to camera direction
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(forward, playerVelocity.z);
    moveVector.addScaledVector(right, playerVelocity.x);

    camera.position.add(moveVector);

    // Boundary checks
    camera.position.x = Math.max(-24, Math.min(24, camera.position.x));
    camera.position.z = Math.max(-24, Math.min(24, camera.position.z));
    camera.position.y = 1.7;

    // Random footstep sounds
    if ((moveForward || moveBackward || moveLeft || moveRight) && Math.random() < 0.05) {
        playSound('footstep');
    }
}

function updateUI() {
    document.getElementById('health-fill').style.width = health + '%';
    document.getElementById('battery-fill').style.width = batteryLevel + '%';
}

function animate() {
    requestAnimationFrame(animate);

    if (gameStarted && !chapterComplete) {
        updatePlayer();
        updateGhosts();
    }

    renderer.render(scene, camera);
}

// Initialize on load
window.addEventListener('load', init);
