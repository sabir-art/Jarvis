import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
 * Deux variantes :
 *  - "bust"  : plan buste dans un cadre (colonne de gauche) ;
 *  - "space" : personnage en pied, sans conteneur, qui flotte dans
 *    l'espace du cerveau — sa lueur se diffuse en gradient radial.
 * Créez un personnage sans Blender avec VRoid Studio (gratuit), ou
 * téléchargez un VRM libre — exportez/déposez le fichier, c'est tout.
 */

type Variant = "bust" | "space";

/**
 * Pose de repos : bras baissés, mains croisées derrière le dos (les VRM
 * sont livrés en T-pose, bras à l'horizontale). Appliquée à chaque image
 * avec un léger balancement pour rester vivante.
 */
function poseArms(vrm: VRM, t: number) {
  const h = vrm.humanoid;
  if (!h) return;
  const sway = Math.sin(t * 0.7) * 0.02;
  const lu = h.getNormalizedBoneNode("leftUpperArm");
  const ru = h.getNormalizedBoneNode("rightUpperArm");
  const ll = h.getNormalizedBoneNode("leftLowerArm");
  const rl = h.getNormalizedBoneNode("rightLowerArm");
  if (lu) {
    lu.rotation.z = -1.32 - sway;
    lu.rotation.x = 0.3;
  }
  if (ru) {
    ru.rotation.z = 1.32 + sway;
    ru.rotation.x = 0.3;
  }
  // coudes pliés : les avant-bras se replient derrière le dos
  if (ll) ll.rotation.y = 1.2;
  if (rl) rl.rotation.y = -1.2;
}

function VrmActor({ vrm, float = false }: { vrm: VRM; float?: boolean }) {
  const orbState = useJarvis((s) => s.orbState);
  const stateRef = useRef(orbState);
  stateRef.current = orbState;

  const blink = useRef({ next: 1.5, phase: -1 });
  const mouth = useRef({ value: 0, target: 0, nextChange: 0 });
  // rotateVRM0 peut avoir orienté la scène : on flotte autour de cette base.
  const base = useRef<{ y: number; rotY: number } | null>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const s = stateRef.current;
    const em = vrm.expressionManager;
    const humanoid = vrm.humanoid;

    /* flottement en apesanteur (variante « space ») */
    if (float) {
      if (!base.current) base.current = { y: vrm.scene.position.y, rotY: vrm.scene.rotation.y };
      vrm.scene.position.y = base.current.y + Math.sin(t * 0.55) * 0.05 + Math.sin(t * 1.3) * 0.012;
      vrm.scene.rotation.y = base.current.rotY + Math.sin(t * 0.22) * 0.07;
      vrm.scene.rotation.z = Math.sin(t * 0.34) * 0.013;
    }

    /* respiration + léger balancement */
    const chest = humanoid?.getNormalizedBoneNode("chest") ?? humanoid?.getNormalizedBoneNode("spine");
    if (chest) {
      chest.rotation.x = Math.sin(t * 1.4) * 0.012;
      chest.rotation.z = Math.sin(t * 0.6) * 0.008;
    }

    /* mains derrière le dos, avec un balancement discret */
    poseArms(vrm, t);

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

function Scene({ vrm, float = false }: { vrm: VRM; float?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.9} color="#cfe9ff" />
      <directionalLight position={[1.5, 2.5, 2]} intensity={1.6} color="#eaf6ff" />
      <directionalLight position={[-2, 1.2, -1.5]} intensity={1.1} color="#35e0ff" />
      <VrmActor vrm={vrm} float={float} />
    </>
  );
}

interface Framing {
  eyeY: number; // hauteur des yeux (plan buste)
  centerY: number; // centre du corps (plan en pied)
  height: number; // hauteur totale du modèle
  halfX: number; // demi-largeur du modèle (pose appliquée)
}

const SPACE_FOV = 26;

/**
 * Recul automatique de la caméra : le corps entier tient dans le cadre,
 * en hauteur ET en largeur (rien n'est jamais coupé, quelle que soit la
 * taille du panneau).
 */
function AutoFrame({ framing }: { framing: Framing }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const halfFov = (SPACE_FOV / 2) * (Math.PI / 180);
    const vDist = (framing.height * 0.62) / Math.tan(halfFov);
    const hDist = framing.halfX / (Math.tan(halfFov) * (size.width / Math.max(size.height, 1)));
    cam.position.set(0, framing.centerY, Math.max(vDist, hDist));
    cam.lookAt(0, framing.centerY, 0);
  }, [camera, size.width, size.height, framing]);
  return null;
}

export default function Avatar3D({
  size = 200,
  variant = "bust",
  onClick,
  onUnavailable,
}: {
  size?: number;
  variant?: Variant;
  onClick?: () => void;
  onUnavailable: () => void;
}) {
  const orbState = useJarvis((s) => s.orbState);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [framing, setFraming] = useState<Framing>({ eyeY: 1.42, centerY: 0.85, height: 1.7, halfX: 0.5 });

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
        // Cadrage automatique, quelle que soit la taille du modèle :
        // pose appliquée d'abord (bras derrière le dos, sinon la T-pose
        // fausse la largeur), puis os de la tête + boîte englobante.
        poseArms(loaded, 0);
        loaded.update(0);
        loaded.scene.updateMatrixWorld(true);
        const head = loaded.humanoid?.getNormalizedBoneNode("head");
        const headPos = new THREE.Vector3();
        if (head) head.getWorldPosition(headPos);
        const box = new THREE.Box3().setFromObject(loaded.scene);
        const height = Math.max(0.6, box.max.y - box.min.y);
        setFraming({
          eyeY: head ? headPos.y + 0.02 : height * 0.88,
          centerY: (box.max.y + box.min.y) / 2,
          height,
          halfX: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * 1.22 + 0.04,
        });
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

  /* ── Variante « space » : en pied, sans conteneur, fondu dans l'espace ── */
  if (variant === "space") {
    return (
      <div
        className={`avatar-space ${orbState}`}
        onClick={onClick}
        role="button"
        aria-label="Parler à Jarvis"
        title="Dites « Jarvis » ou cliquez pour parler"
      >
        <div className="space-glow" />
        <div className="space-glow inner" />
        <Canvas
          gl={{ alpha: true, antialias: true }}
          camera={{ position: [0, framing.centerY, 4.4], fov: SPACE_FOV }}
          dpr={[1, 2]}
        >
          <AutoFrame framing={framing} />
          <Scene vrm={vrm} float />
        </Canvas>
        <span className="holo-particle p1" />
        <span className="holo-particle p2" />
        <span className="holo-particle p3" />
      </div>
    );
  }

  /* ── Variante « bust » : plan buste dans la colonne de gauche ── */
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
        camera={{ position: [0, framing.eyeY, 1.35], fov: 24 }}
        onCreated={({ camera }) => camera.lookAt(0, framing.eyeY, 0)}
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
