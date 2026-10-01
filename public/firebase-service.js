import { auth, db } from './firebase-config.js?v=20260825-auth62';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

async function ensureProfile(user, extra={}) {
  await setDoc(doc(db,'users',user.uid), {
    email:user.email || '',
    displayName:user.displayName || extra.displayName || 'Estudante',
    photoURL:user.photoURL || null,
    ...extra,
    updatedAt:serverTimestamp()
  }, {merge:true});
}

export async function loginWithGoogle(){
  try{
    const result=await signInWithPopup(auth,provider);
    await ensureProfile(result.user,{institution:'UFRPE',courseName:'Computação'});
    return result.user;
  }catch(error){
    if(error.code==='auth/popup-blocked'||error.code==='auth/cancelled-popup-request'){
      await signInWithRedirect(auth,provider);
      return null;
    }
    throw error;
  }
}
export async function finishRedirectLogin(){
  const result=await getRedirectResult(auth);
  if(!result)return null;
  await ensureProfile(result.user,{institution:'UFRPE',courseName:'Computação'});
  return result.user;
}
export async function loginWithEmail(email,password){
  const result=await signInWithEmailAndPassword(auth,email,password);
  await ensureProfile(result.user,{institution:'UFRPE',courseName:'Computação'});
  return result.user;
}
export async function registerWithEmail(name,email,password){
  const result=await createUserWithEmailAndPassword(auth,email,password);
  if(name) await updateProfile(result.user,{displayName:name});
  await ensureProfile(result.user,{displayName:name||'Estudante',institution:'UFRPE',courseName:'Computação'});
  return result.user;
}
export function watchAuth(callback){return onAuthStateChanged(auth,user=>callback(user,null))}
export async function logout(){return signOut(auth)}

function currentUser(){
  const user=auth.currentUser;
  if(!user) throw new Error('Faça login para continuar.');
  return user;
}
function userDoc(){return doc(db,'users',currentUser().uid)}
function userCollection(name){return collection(db,'users',currentUser().uid,name)}

async function list(name,sortField=null){
  const ref=sortField?query(userCollection(name),orderBy(sortField,'asc')):userCollection(name);
  const snap=await getDocs(ref);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function add(name,payload){
  const ref=await addDoc(userCollection(name),{...payload,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return ref.id;
}
async function update(name,id,payload){
  await updateDoc(doc(userCollection(name),id),{...payload,updatedAt:serverTimestamp()});
}
async function remove(name,id){
  await deleteDoc(doc(userCollection(name),id));
}

export async function getProfile(){
  const snap=await getDoc(userDoc());
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}
export async function saveProfile(payload){
  await setDoc(userDoc(),{...payload,updatedAt:serverTimestamp()},{merge:true});
}

export const listSubjects=()=>list('subjects');
export const createSubject=item=>add('subjects',item);
export const updateSubject=(id,item)=>update('subjects',id,item);
export const removeSubject=id=>remove('subjects',id);

export async function replaceSubjects(items){
  const user=currentUser();
  const existing=await listSubjects();
  const batch=writeBatch(db);
  existing.forEach(item=>batch.delete(doc(db,'users',user.uid,'subjects',item.id)));
  items.forEach(item=>{
    const ref=doc(collection(db,'users',user.uid,'subjects'));
    batch.set(ref,{...item,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  });
  await batch.commit();
}

export const listTasks=()=>list('tasks','dueAt');
export async function createTask(task){return add('tasks',{...task,completed:false,calendarEventId:null})}
export const updateTask=(id,payload)=>update('tasks',id,payload);
export const removeTask=id=>remove('tasks',id);

export const listSchedule=()=>list('schedule');
export async function saveScheduleItem(item){
  if(item.id){const {id,...rest}=item;await update('schedule',id,rest);return id}
  return add('schedule',item);
}
export const removeScheduleItem=id=>remove('schedule',id);

export const listAbsences=()=>list('absences');
export async function addAbsence(item){return add('absences',{...item,absences:Number(item.absences||1)})}
export const removeAbsence=id=>remove('absences',id);

export const listAssessments=()=>list('assessments');
export async function saveAssessment(item){
  if(item.id){const {id,...rest}=item;await update('assessments',id,rest);return id}
  return add('assessments',item);
}
export const removeAssessment=id=>remove('assessments',id);

export const listSubjectSettings=()=>list('subjectSettings');
export async function saveSubjectSetting(item){
  const existing=(await listSubjectSettings()).find(x=>x.subjectId===item.subjectId);
  if(existing){await update('subjectSettings',existing.id,item);return existing.id}
  return add('subjectSettings',item);
}
