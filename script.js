
      import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
      import { EffectComposer } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
      import { RenderPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
      import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';
      import { ShaderPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/ShaderPass.js';
      import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';

      // 小さな補助関数：テキストをスクランブル
      function scrambleText(selector, options = {}) {
        const { speed = 40, duration = 1200, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}<>?', delayBetween = 20 } = options;
        const element = document.querySelector(selector);
        if (!element) return;
        const originalText = element.textContent;
        const output = Array(originalText.length).fill('');
        const resolveFrames = Array.from({ length: originalText.length }, (_, i) => Math.floor(Math.random() * (duration / speed)) + i * (delayBetween / speed));
        element.textContent = '';
        let frame = 0;
        const interval = setInterval(() => {
          for (let i = 0; i < originalText.length; i++) {
            if (frame >= resolveFrames[i]) output[i] = originalText[i];
            else output[i] = characters.charAt(Math.floor(Math.random() * characters.length));
          }
          element.textContent = output.join('');
          frame++;
          if (frame > Math.max(...resolveFrames)) { clearInterval(interval); element.textContent = originalText }
        }, speed);
      }
      scrambleText('.note', { speed: 30, duration: 1500, delayBetween: 30 });

      // シーンとレンダラーの設定
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.z = 6;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // clamp DPR for performance
      document.body.appendChild(renderer.domElement);

      // コントロール：複数使うと衝突するので OrbitControls 1つだけ使う
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.02;
      controls.maxDistance = 20;
      controls.minDistance = 0.1;
      controls.panSpeed = 0.02;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 1;
      controls.enableZoom = false;

      // ジオメトリ：詳細度を下げてフレームレート改善
      const geometry = new THREE.IcosahedronGeometry(1, 5); 

      // シェーダーマテリアル：構造は維持しているが、処理が重い部分はさらに簡略化
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 6.0 },
          uDepth: { value: 1 },
          uSharpness: { value: 3.0 },
          uSpeed: { value: 0 },
          uColor: { value: new THREE.Color('#00ff00') },
          uNoiseScale: { value: 1.5 },
          uNoiseStrength: { value: 1.4 },
          uOutlineWidth: { value: 0.5 },
          uOutlineColor: { value: new THREE.Color('#0a0060') },
          uSecondaryColor: { value: new THREE.Color('#ff005f') },
          uDisplacementStrength: { value: 1 }
        },
        vertexShader: `
          uniform float uTime; uniform float uScale; uniform float uSharpness; uniform float uSpeed; uniform float uNoiseScale; uniform float uNoiseStrength; uniform float uDisplacementStrength;
          varying vec3 vNormal; varying vec3 v3Position; varying float vShellPattern;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float noise(vec2 uv,float timeOffset){ vec2 i=floor(uv); vec2 f=fract(uv); float a=hash(i+vec2(timeOffset)); float b=hash(i+vec2(1.0,0.0)+vec2(timeOffset)); float c=hash(i+vec2(0.0,1.0)+vec2(timeOffset)); float d=hash(i+vec2(1.0,1.0)+vec2(timeOffset)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
          float voronoi(vec2 uv,float t){ vec2 g=floor(uv); vec2 f=fract(uv); float minDist1=1.0; float secondMinDist1=1.0; float minDist2=1.0; float secondMinDist2=1.0; float t0=t; float t1=t+1.0; float a = smoothstep(0.0,1.0,fract(t)); for(int y=-1;y<=1;y++){ for(int x=-1;x<=1;x++){ vec2 lattice=vec2(x,y); vec2 perturbed = lattice + uNoiseStrength*(noise((g+lattice)*uNoiseScale,t0)*2.0-1.0); vec2 point = hash(g+perturbed)+perturbed - f; float dist = length(point); if(dist<minDist1){ secondMinDist1=minDist1; minDist1=dist; } else if(dist<secondMinDist1) secondMinDist1=dist; } }
            for(int y=-1;y<=1;y++){ for(int x=-1;x<=1;x++){ vec2 lattice=vec2(x,y); vec2 perturbed = lattice + uNoiseStrength*(noise((g+lattice)*uNoiseScale,t1)*2.0-1.0); vec2 point = hash(g+perturbed)+perturbed - f; float dist = length(point); if(dist<minDist2){ secondMinDist2=minDist2; minDist2=dist; } else if(dist<secondMinDist2) secondMinDist2=dist; } }
            float pattern1 = secondMinDist1 - minDist1; float pattern2 = secondMinDist2 - minDist2; return mix(pattern1, pattern2, a);
          }
          float triplanar(vec3 p, vec3 normal, float t){ vec3 blending = abs(normal); blending = normalize(max(blending,0.00001)); blending /= (blending.x+blending.y+blending.z); float x = voronoi(p.yz * uScale, t); float y = voronoi(p.xz * uScale, t); float z = voronoi(p.xy * uScale, t); return (x*blending.x + y*blending.y + z*blending.z); }
          void main(){ vec3 transformedNormal = normalize(normalMatrix*normal); vec3 displacedPosition = position; float time = uTime * uSpeed; float patternValue = triplanar(position, normal, time); vShellPattern = patternValue; float softPattern = smoothstep(0.2,0.8,patternValue); float displacementFactor = softPattern * uDisplacementStrength; displacedPosition += normal * displacementFactor; vNormal = transformedNormal; v3Position = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition,1.0); }
        `,
        fragmentShader: `
          uniform float uTime; uniform float uDepth; uniform vec3 uColor; uniform float uOutlineWidth; uniform vec3 uOutlineColor; uniform vec3 uSecondaryColor; varying vec3 vNormal; varying vec3 v3Position; varying float vShellPattern;
          void main(){ float steppedPattern = smoothstep(uOutlineWidth, uOutlineWidth + 0.2, vShellPattern); vec3 lightDirection = normalize(vec3(0.5,0.5,1.0)); float lighting = dot(vNormal, lightDirection) * 0.5 + 0.5; vec3 baseColor = mix(uOutlineColor, uSecondaryColor, steppedPattern); float highlightIntensity = smoothstep(0.0,0.5,vShellPattern); vec3 finalColor = baseColor + uColor * highlightIntensity * uDepth * lighting; gl_FragColor = vec4(finalColor * lighting, 1.0); }
        `,
        wireframe: true
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(5,5,5);
      scene.add(light);

      // ポストプロセス（後処理）用のコンポーザー
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));

      // 六角形
      const flyShader = {
        uniforms: {
          tDiffuse: { value: null },
          resolution: { value: new THREE.Vector2(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()) },
          time: { value: 0 },
          ommatidiaSize: { value: 6.0 }
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float ommatidiaSize;
          // A simpler, less costly hex-mask implementation
          float hexMask(vec2 uv, float size){ vec2 p = uv * resolution / size; vec2 id = floor(p);
            vec2 f = fract(p) - 0.5; // local coord
            // transform for vertical hex
            f.x *= 0.57735; // approx sqrt(3)/3 reduces distortion
            f = abs(f);
            float a = max(f.y * 0.866025 + f.x, f.x * 2.0);
            // smooth edge for nicer result
            return smoothstep(0.5, 0.45, a);
          }
          void main(){ vec2 hexUV = floor((vUv * resolution) / ommatidiaSize) * ommatidiaSize / resolution + (ommatidiaSize*0.5)/resolution; vec4 color = texture2D(tDiffuse, hexUV); float mask = hexMask(vUv, ommatidiaSize); gl_FragColor = color * mask; }
        `
      };

      const flyPass = new ShaderPass(flyShader);
      flyPass.renderToScreen = false; // 最後のパスが画面に描画されるようにする
      composer.addPass(flyPass);

      // 光のにじみは最後の処理にすることで、六角シェーダーの結果にも影響するようにする
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.3, 0.4, 0.0);
      bloomPass.renderToScreen = true;
      composer.addPass(bloomPass);

      // リアルタイム操作のパネル
      const gui = new dat.GUI();
      gui.domElement.style.display = "none";




      // 正しい16進カラーを生成する処理
      function getRandomColor() {
        let color = '#';
        const hex = '0123456789ABCDEF';
        for (let i = 0; i < 6; i++) color += hex[Math.floor(Math.random() * 16)];
        return color;
      }

      const randomizer = {
        randomize: () => {
          material.uniforms.uScale.value = 1 + Math.random() * 19;
          material.uniforms.uDepth.value = Math.random() * 2;
          material.uniforms.uSharpness.value = 1 + Math.random() * 9;
          material.uniforms.uColor.value.set(getRandomColor());
          material.uniforms.uNoiseScale.value = 0.1 + Math.random() * 4.9;
          material.uniforms.uNoiseStrength.value = Math.random() * 1;
          material.uniforms.uOutlineWidth.value = 0.01 + Math.random() * 0.99;
          material.uniforms.uOutlineColor.value.set(getRandomColor());
          material.uniforms.uSecondaryColor.value.set(getRandomColor());
          material.uniforms.uDisplacementStrength.value = -0.5 + Math.random() * 5.5;
        }
      };

      

      const flyFolder = gui.addFolder('ShaderPass');
      flyFolder.add(flyPass, 'enabled').name('HexaVision');
      flyFolder.add(flyPass.material.uniforms.ommatidiaSize, 'value', 2.0, 200).step(1).name('Ommatidia Size');
      flyFolder.add(randomizer, 'randomize').name('Randomize All (Double Click)');

      const guiControls = { wireframe: true };
      flyFolder.add(guiControls, 'wireframe').name('Toggle Wireframe').onChange(v => { material.wireframe = v });
      flyFolder.open();

      const patternFolder = gui.addFolder('Shader Pattern');
      patternFolder.add(material.uniforms.uScale, 'value', 1, 20).name('Pattern Scale');
      patternFolder.add(material.uniforms.uDepth, 'value', 0, 2).name('Highlight Depth');
      patternFolder.add(material.uniforms.uSharpness, 'value', 1, 10).name('Pattern Sharpness');
      patternFolder.addColor({ color: '#ff00f1' }, 'color').onChange(val => material.uniforms.uColor.value.set(val)).name('Highlight Color');

      const displacementFolder = gui.addFolder('Displacement');
      displacementFolder.add(material.uniforms.uNoiseScale, 'value', 0.1, 5.0).name('Noise Scale');
      displacementFolder.add(material.uniforms.uNoiseStrength, 'value', 0.0, 1.0).name('Noise Strength');
      displacementFolder.add(material.uniforms.uOutlineWidth, 'value', 0.01, 1).name('Outline Width');
      displacementFolder.addColor({ outline: '#0a0060' }, 'outline').onChange(val => material.uniforms.uOutlineColor.value.set(val)).name('Outline Color');
      displacementFolder.addColor({ secondary: '#ff005f' }, 'secondary').onChange(val => material.uniforms.uSecondaryColor.value.set(val)).name('Scale Fill Color');
      displacementFolder.add(material.uniforms.uDisplacementStrength, 'value', -0.5, 5).name('Displacement Strength');

      const bloomFolder = gui.addFolder('Bloom');
      bloomFolder.add(bloomPass, 'strength', 0.0, 3.0).name('Strength');
      bloomFolder.add(bloomPass, 'radius', 0.0, 1.0).name('Radius');
      bloomFolder.add(bloomPass, 'threshold', 0.0, 1.0).name('Threshold');

      // ウィンドウのリサイズ
      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        composer.setSize(window.innerWidth, window.innerHeight);
        flyPass.material.uniforms.resolution.value.set(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
      });

      function animate(time) {
        material.uniforms.uTime.value = time * 0.001;
        flyPass.material.uniforms.time.value = time * 0.001;
        mesh.rotation.x += 0.0002; mesh.rotation.y += 0.001; mesh.rotation.z += 0.0002;
        controls.update();
        composer.render();
        requestAnimationFrame(animate);
      }
      animate();

      // ウィンドウのリサイズ
      import anime from 'https://cdn.skypack.dev/animejs@3.2.1';
      const notif = document.getElementById('notification');
      const closeBtn = document.getElementById('closeBtn');
      anime({ targets: notif, bottom: '24px', easing: 'easeOutExpo', duration: 800, delay: 1000 });
      closeBtn.addEventListener('click', () => { anime({ targets: notif, bottom: '-100px', easing: 'easeInExpo', duration: 600 }); });