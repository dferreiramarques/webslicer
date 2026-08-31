import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeThreeMFParts } from './threemf-parts.js';

export class Viewer {
  constructor(container, limits) {
    this.container = container;
    this.limits = limits;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 4000);
    this.camera.position.set(limits.bedWidth, limits.bedWidth * 1.2, limits.bedDepth * 1.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(limits.bedWidth / 2, 0, limits.bedDepth / 2);
    this.controls.update();

    this._buildLights();
    this.bedGroup = null;
    this._buildBed();
    this.mesh = null;

    window.addEventListener('resize', () => this._onResize());
    this._animate();
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x14171a, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(150, 400, 200);
    this.scene.add(dir);
  }

  _buildBed() {
    const { bedWidth, bedDepth } = this.limits;
    const group = new THREE.Group();

    const grid = new THREE.GridHelper(Math.max(bedWidth, bedDepth), 22, 0x2a2f35, 0x1f2327);
    grid.position.set(bedWidth / 2, 0, bedDepth / 2);
    group.add(grid);

    const plateGeo = new THREE.PlaneGeometry(bedWidth, bedDepth);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x0f1113, transparent: true, opacity: 0.5 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(bedWidth / 2, -0.05, bedDepth / 2);
    group.add(plate);

    const edges = new THREE.EdgesGeometry(plateGeo);
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00d4aa, transparent: true, opacity: 0.5 }));
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(bedWidth / 2, 0, bedDepth / 2);
    group.add(outline);

    this.scene.add(group);
    this.bedGroup = group;
  }

  /** Troca de impressora: recria a mesa/grelha para o novo volume de impressão. */
  setLimits(limits) {
    this.limits = limits;

    this.scene.remove(this.bedGroup);
    this.bedGroup.traverse((child) => {
      if (child.isMesh || child.isLineSegments) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    this._buildBed();

    this.controls.target.set(limits.bedWidth / 2, 0, limits.bedDepth / 2);
    this.camera.position.set(limits.bedWidth, limits.bedWidth * 1.2, limits.bedDepth * 1.4);
    this.controls.update();
  }

  /** Remove o modelo atualmente carregado (ex: ao trocar de impressora). */
  clearModel() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => m?.dispose());
      }
    });
    this.mesh = null;
  }

  loadModel(arrayBuffer, extension) {
    return new Promise((resolve, reject) => {
      try {
        let object;
        let sliceBuffer = arrayBuffer;
        let sliceExt = extension;

        if (extension === '3mf') {
          const loader = new ThreeMFLoader();
          object = loader.parse(mergeThreeMFParts(arrayBuffer));

          // O conversor 3MF embutido no cura-wasm não percebe objetos
          // multi-parte (Bambu/Orca Slicer) e falha ao fatiar ("FS error").
          // Como já montámos a malha correta aqui, exportamo-la como STL
          // binário (nas coordenadas originais do modelo) e é isso que vai
          // para o motor — só a pré-visualização usa o objeto 3MF.
          object.updateMatrixWorld(true);
          const stlData = new STLExporter().parse(object, { binary: true });
          sliceBuffer = stlData.buffer;
          sliceExt = 'stl';
        } else {
          const loader = new STLLoader();
          const geometry = loader.parse(arrayBuffer);
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: 0x00d4aa,
            metalness: 0.1,
            roughness: 0.55,
            flatShading: false
          });
          object = new THREE.Mesh(geometry, material);
        }

        this.clearModel();

        // Centra o modelo sobre a mesa e assenta-o em Z=0
        object.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(object);
        const sizeX = bbox.max.x - bbox.min.x;
        const sizeY = bbox.max.y - bbox.min.y;
        const sizeZ = bbox.max.z - bbox.min.z;

        object.rotation.x = -Math.PI / 2; // STL/3MF costumam vir com Z para cima -> Three usa Y para cima
        object.position.set(
          this.limits.bedWidth / 2 - (bbox.min.x + sizeX / 2),
          -bbox.min.z,
          this.limits.bedDepth / 2 + (bbox.min.y + sizeY / 2)
        );

        this.scene.add(object);
        this.mesh = object;

        this._frame(sizeX, sizeZ, sizeY);

        resolve({ x: sizeX, y: sizeY, z: sizeZ, sliceBuffer, sliceExt });
      } catch (err) {
        reject(err);
      }
    });
  }

  _frame(sizeX, sizeY, sizeZ) {
    const maxDim = Math.max(sizeX, sizeY, sizeZ, 60);
    const dist = maxDim * 2.2;
    this.camera.position.set(
      this.limits.bedWidth / 2 + dist * 0.6,
      dist * 0.55,
      this.limits.bedDepth / 2 + dist * 0.6
    );
    this.controls.update();
  }

  _onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
