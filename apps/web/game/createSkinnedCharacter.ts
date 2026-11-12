import {Bone,BoundingInfo,Color3,Geometry,Matrix,Mesh,Scene,Skeleton,StandardMaterial,SubMesh,Vector3,VertexData} from '@babylonjs/core';
import {createCharacterRig} from './characterRig';
import {BONE_NAMES,DEFAULT_PALETTE,generateCharacterGeometry,type CharacterPalette} from './characterGeometry';
import type {CharacterPose} from '../../../packages/game-core/src/motion';
const assets=new WeakMap<Scene,{material:StandardMaterial;geometries:Map<string,{geometry:Geometry;ranges:{indexStart:number;indexCount:number}[]}>}>();
function sharedAsset(scene:Scene,palette:CharacterPalette){
 let cache=assets.get(scene);if(!cache){const material=new StandardMaterial('minimal-character:vertex-color',scene);material.diffuseColor=Color3.White();material.specularColor=new Color3(.08,.08,.08);material.backFaceCulling=false;material.twoSidedLighting=true;cache={material,geometries:new Map()};assets.set(scene,cache);}
 const key=JSON.stringify(palette);let asset=cache.geometries.get(key);if(asset?.geometry.isDisposed())asset=undefined;
 if(!asset){const data=generateCharacterGeometry(palette),vd=new VertexData();vd.positions=data.positions;vd.colors=data.colors;vd.indices=data.indices;vd.matricesIndices=data.matricesIndices;vd.matricesWeights=data.matricesWeights;const normals:number[]=[];VertexData.ComputeNormals(data.positions,data.indices,normals);vd.normals=normals;const geometry=new Geometry('minimal-character:shared-'+cache.geometries.size,scene,vd,false);asset={geometry,ranges:data.ranges};cache.geometries.set(key,asset);}
 return {...asset,material:cache.material};
}
export function createSkinnedCharacter(scene:Scene,options:{name:string;firstPerson:boolean;colors?:Partial<CharacterPalette>}){
 const rig=createCharacterRig(scene,options.name),palette={...DEFAULT_PALETTE,...options.colors},asset=sharedAsset(scene,palette),skeleton=new Skeleton(options.name+':skin',options.name+':skin',scene),bones=new Map<string,Bone>();
 const nodes={...rig.joints,...rig.correctives};const nodeNames=new Map(Object.entries(nodes).map(([name,node])=>[node,name]));
 // Bind vertices are root-local. Meshes inherit the world root; the root bone MUST
 // stay identity to avoid applying player yaw/translation twice.
 for(const name of BONE_NAMES){const node=nodes[name],parent=name==='root'?null:bones.get(nodeNames.get(node.parent as typeof rig.root)??'root')!;
  const bone=new Bone(options.name+':'+name,skeleton,parent,name==='root'?Matrix.Identity():Matrix.Translation(node.position.x,node.position.y,node.position.z));
  if(name!=='root')bone.linkTransformNode(node);bones.set(name,bone);
 }
 skeleton.computeAbsoluteMatrices(true);
 const meshes=asset.ranges.map((range,i)=>{const mesh=new Mesh(options.name+':minimal-'+['body','arms','legs'][i],scene);asset.geometry.applyToMesh(mesh);mesh.subMeshes=[];new SubMesh(0,0,asset.geometry.getTotalVertices(),range.indexStart,range.indexCount,mesh);mesh.parent=rig.root;mesh.skeleton=skeleton;mesh.numBoneInfluencers=4;mesh.computeBonesUsingShaders=true;mesh.material=asset.material;mesh.isPickable=false;mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1.3,-.3,-1.4),new Vector3(1.3,3,1.5)));return mesh;});
 if(options.firstPerson)meshes[0].setEnabled(false);
 function update(pose:CharacterPose){rig.update(pose);if(options.firstPerson)meshes[2].setEnabled(!pose.attacking);}
 return {...rig,meshes,skeleton,update};
}
