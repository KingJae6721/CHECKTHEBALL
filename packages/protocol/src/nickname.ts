export const NICKNAME_MAX=20;
export function validateNickname(value:unknown):{name:string;error:string|null}{
 if(typeof value!=='string')return {name:'',error:'닉네임을 입력해주세요.'};
 const name=value.trim();
 if(/[\u0000-\u001f\u007f-\u009f]/.test(value))return {name,error:'닉네임에 제어 문자를 사용할 수 없습니다.'};
 if(!name)return {name,error:'닉네임을 입력해주세요.'};
 if(name.length>NICKNAME_MAX)return {name,error:`닉네임은 ${NICKNAME_MAX}자 이내로 입력해주세요.`};
 return {name,error:null};
}
