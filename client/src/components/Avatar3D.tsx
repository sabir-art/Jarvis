import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { useJarvis } from "../state";

/**
 * Avatar 3D vivant (format VRM — le standard des avatars anime/VTuber).
 * Placez votre modèle dans `client/public/avatar.vrm` : JARVIS prend vie.
 *  - il respire et se balance doucement au repos ;
 *  - il cligne des yeux naturellement ;
 *  - ses lèvres bougent quand il parle (synchronisées à la voix) ;
 *  - il penche la tête et vous regarde quand il écoute ;
 *  - il lève les yeux quand il réfléchit.
 * Créez un personnage sans Blender avec VRoid Studio (gratuit), ou
 * téléchargez un VRM libre — exportez/déposez le fichier, c'est tout.
 */

function VrmActor({ vrm }: { vrm: VRM }) {
  const orbState = useJarvis((s) => s.orbState);
  const stateRef = useRef(orbState);
  stateRef.current = orbState;

  const blink = useRef({ next: 1.5, phase: -1 });
  const mouth = useRef({ value: 0, target: 0, nextChange: 0 });

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const s = stateRef.current;
    const em = vrm.expressionManager;
    const humanoid = vrm.humanoid;

    /* respiration + léger balancement */
    const chest = humanoid?.getNormalizedBoneNode("chest") ?? humanoid?.getNormalizedBoneNode("spine");
    if (chest) {
      chest.rotation.x = Math.sin(t * 1.4) * 0.012;
      chest.rotation.z = Math.sin(t * 0.6) * 0.008;
    }

    /* tête : écoute → inclinée vers vous ; réflexion → regard en l'air */
    const head = humanoid?.getNormalizedBoneNode("head");
    if (head) {
      const tiltZ = s === "listening" ? 0.09 : 0;
      const tiltX = s === "thinking" ? -0.1 : 0.02;
      head.rotation.z += (tiltZ + Math.sin(t * 0.8) * 0.01 - head.rotation.z) * 0.08;
      head.rotation.x += (tiltX + Math.sin(t * 1.1) * 0.008 - head.rotation.x) * 0.08;
      head.rotation.y += (Math.sin(t * 0.5) * 0.02 - head.rotation.y) * 0.05;
    }

    /* clignement naturel */
    const b = blink.current;
    if (b.phase < 0 && t > b.next) b.phase = 0;
    if (b.phase >= 0) {
      b.phase += delta;
      const v = b.phase < 0.08 ? b.phase / 0.08 : Math.max(0, 1 - (b.phase - 0.08) / 0.1);
      em?.setValue("blink", v);
      if (b.phase > 0.2) {
        b.phase = -1;
        b.next = t + 1.8 + Math.random() * 3.2;
        em?.setValue("blink", 0);
      }
    }

    /* bouche : parle → syllabes pseudo-aléatoires, sinon fermée */
    const m = mouth.current;
    if (s === "speaking") {
      if (t > m.nextChange) {
        m.target = 0.12 + Math.random() * 0.75;
        m.nextChange = t + 0.07 + Math.random() * 0.09;
      }
    } else {
      m.target = 0;
    }
    m.value += (m.target - m.value) * Math.min(1, delta * 18);
    em?.setValue("aa", m.value);

    /* un léger sourire quand il écoute */
    em?.setValue("happy", s === "listening" ? 0.35 : 0);

    em?.update();
    vrm.update(delta);
  });

  return <primitive object={vrm.scene} />;
}

function Scene({ vrm }: { vrm: VRM }) {
  return (
    <>
      <ambientLight intensity={0.9} color="#cfe9ff" />
      <directionalLight position={[1.5, 2.5, 2]} intensity={1.6} color="#eaf6ff" />
      <directionalLight position={[-2, 1.2, -1.5]} intensity={1.1} color="#35e0ff" />
      <VrmActor vrm={vrm} />
    </>
  );
}

export default function Avatar3D({
  size = 200,
  onClick,
  onUnavailable,
}: {
  size?: number;
  onClick?: () => void;
  onUnavailable: () => void;
}) {
  const orbState = useJarvis((s) => s.orbState);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [eyeY, setEyeY] = useState(1.42);

  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      "/avatar.vrm",
      (gltf) => {
        const loaded = gltf.userData.vrm as VRM | undefined;
        if (!loaded || disposed) {
          if (!disposed) onUnavailable();
          return;
        }
        VRMUtils.removeUnnecessaryVertices(loaded.scene);
        VRMUtils.combineSkeletons(loaded.scene);
        VRMUtils.rotateVRM0(loaded); // les modèles VRM 0.x regardent vers -Z
        loaded.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        // Cadrage automatique : on vise les yeux, quelle que soit la
        // taille du modèle (position réelle de l'os de la tête).
        loaded.scene.updateMatrixWorld(true);
        const head = loaded.humanoid?.getNormalizedBoneNode("head");
        if (head) {
          const p = new THREE.Vector3();
          head.getWorldPosition(p);
          setEyeY(p.y + 0.02);
        }
        setVrm(loaded);
      },
      undefined,
      () => {
        if (!disposed) onUnavailable(); // pas de fichier /avatar.vrm : repli
      },
    );
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!vrm) return null; // en attente de chargement (ou repli déclenché)

  return (
    <div
      className={`holo avatar3d ${orbState}`}
      style={{ width: size, height: size * 1.25 }}
      onClick={onClick}
      role="button"
      aria-label="Parler à Jarvis"
      title="Dites « Jarvis » ou cliquez pour parler"
    >
      <div className="holo-glow" />
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, eyeY, 1.35], fov: 24 }}
        onCreated={({ camera }) => camera.lookAt(0, eyeY, 0)}
        dpr={[1, 2]}
      >
        <Scene vrm={vrm} />
      </Canvas>
      <div className="holo-scanlines" />
      <div className="holo-base" />
      <span className="holo-particle p1" />
      <span className="holo-particle p2" />
      <span className="holo-particle p3" />
    </div>
  );
}
