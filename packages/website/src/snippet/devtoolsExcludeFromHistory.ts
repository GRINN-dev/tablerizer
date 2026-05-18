import { Runtime } from 'foldkit'

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    excludeFromHistory: ['TickedFrame', 'MovedPointer'],
  },
})

Runtime.run(program)
