jest.mock("@ant-design/icons", () => {
  const React = require("react");
  const cache = {};

  return new Proxy(cache, {
    get(target, name) {
      if (name === "__esModule") return true;
      if (!target[name]) {
        target[name] = React.forwardRef(function MockAntIcon(props, ref) {
          return React.createElement("span", {
            ...props,
            ref,
            "data-ant-icon": String(name),
          });
        });
      }
      return target[name];
    },
  });
});
