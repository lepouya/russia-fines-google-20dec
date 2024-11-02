export default function compile<Args extends unknown[], Res = unknown>(
  body: string,
  thisBind?: any,
  args: string[] = [],
  globals: Record<string, any> = {},
  reserved: string[] = [],
): (...args: Args) => Res {
  let fnBody = body.replace(/\b\w+\b/gim, function (token) {
    if (!token || token === "this" || reserved.includes(token)) {
      return token;
    } else if (args.includes(token)) {
      return "___param_" + token;
    } else if (globals[token]) {
      return "___globals." + token;
    } else {
      return token;
    }
  });

  const fnArgs = args.map((arg) => "___param_" + arg);
  fnBody = `(function (${fnArgs.join(",")}) { return (${fnBody}); })`;
  fnBody = `(function (___globals) { return (${fnBody}); })`;

  let fn: any;
  try {
    fn = eval(fnBody);
  } catch (error: any) {
    fn = (/*globals*/) => (/*args*/) => {
      throw error;
    };
  }

  if (thisBind && typeof fn === "function") {
    fn = fn.bind(thisBind);
  }

  if (typeof fn === "function") {
    fn = fn(globals);
    if (thisBind && typeof fn === "function") {
      fn = fn.bind(thisBind);
    }
  }

  if (typeof fn !== "function") {
    fn = () => fn;
  }

  fn.toString = () => body;
  fn.compiled = {
    body,
    args,
    globals,
    reserved,
    wrapped: fnBody,
  };
  return fn;
}
