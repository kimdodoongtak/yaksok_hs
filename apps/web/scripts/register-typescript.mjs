import { registerHooks } from "node:module";
// Node.js 24의 타입 제거 기능으로 서버 모듈을 실행할 때 상대 TS 경로만 보완한다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier))
        return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
