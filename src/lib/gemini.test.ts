import {describe,expect,it} from 'vitest';
import {classifyGeminiFailure} from './gemini';

describe('safe Gemini error classification',()=>{
  it.each([null,undefined,'private provider payload',new Error('private provider payload'),{status:'429',message:'private provider payload'}])('keeps unknown failures generic and private (%#)',failure=>{
    const result=classifyGeminiFailure(failure);
    expect(result).toMatchObject({code:'GEMINI_FAILED',status:502});
    expect(result.message).not.toContain('private provider payload');
    expect(result.message).not.toContain('API_KEY_INVALID');
  });
  it.each(['API_KEY_INVALID in arbitrary private text','null',JSON.stringify({error:{details:'API_KEY_INVALID'}})])('does not misclassify arbitrary 400 text as invalid credentials (%#)',message=>{
    expect(classifyGeminiFailure({status:400,message})).toMatchObject({code:'GEMINI_REQUEST',status:502});
  });
  it('uses the bounded request abort signal to classify SDK-wrapped timeout failures',()=>{
    expect(classifyGeminiFailure(new Error('private transport failure'),{timedOut:true})).toMatchObject({code:'GEMINI_TIMEOUT',status:504});
  });
  it('does not classify malformed model output as an authentication failure',()=>{
    expect(classifyGeminiFailure(new SyntaxError('private model output'))).toMatchObject({code:'GEMINI_FAILED',status:502});
  });
});
