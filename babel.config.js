export default function (api) {
  api.cache(true);
  
  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      '@babel/preset-react'
    ],
    plugins: [
      '@babel/plugin-proposal-private-property-in-object'
    ]
  };
};