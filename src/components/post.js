/* global EventSource */

import React, { Component } from 'react'
import hoistNonReactStatics from 'hoist-non-react-statics'
import getDisplayName from 'react-display-name'

import { load } from '../entries'
import { resetFetchCache } from '../entries/cache'
import endpoints from '../endpoints'

export { default as Content } from './content'

export default (WrappedComponent) => {
  const displayName = getDisplayName(WrappedComponent)

  return hoistNonReactStatics(
    class extends Component {
      static displayName = `WithPost(${displayName})`

      static async getInitialProps (...args) {
        const wrappedInitial = WrappedComponent.getInitialProps
        const wrapped = wrappedInitial ? await wrappedInitial(...args) : {}
        const [{ query = {}, asPath }] = args
        const { __id } = query
        let post

        if (__id) {
          try {
            ([post] = await load(__id))
          } catch (err) {
            // When a new BUILD is pushed to production, josn file names change so we might be pointing to the wrong file.
            // To avoid the missing file, we just reload the current page on the next tick and return a dummy post.
            if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
              console.log(`[reloading] Server build might has been changed. Using ${asPath} to reload.`)

              post = { data: { __id, date: Date.now() } }

              process.nextTick(() => {
                window.location = asPath
                window.location.reload()
              })
            }
          }
        }

        return {
          ...wrapped,
          post,
          __id
        }
      }

      static getDerivedStateFromProps (props, { post }) {
        if (!post || props.__id !== post.data.__id) {
          return {
            post: props.post
          }
        }

        return null
      }

      state = {}

      listenToEventSource () {
        if (process.env.NODE_ENV === 'development') {
          if (this.evtSource) {
            this.evtSource.close()
          }

          this.evtSource = new EventSource(endpoints.entriesHMR())
          const { __id } = this.props

          this.evtSource.onmessage = async (event) => {
            if (event.data === '\uD83D\uDC93') {
              return
            }

            const updated = JSON.parse(event.data)

            if (updated === __id) {
              resetFetchCache()
              const [post] = __id ? await load(__id) : []
              this.setState({
                post
              })
            }
          }
        }
      }

      componentDidMount () {
        this.listenToEventSource()
      }

      componentDidUpdate () {
        this.listenToEventSource()
      }

      componentWillUnmount () {
        if (this.evtSource) {
          this.evtSource.close()
        }
      }

      render () {
        return <WrappedComponent {...this.props} post={this.state.post} />
      }
    },
    WrappedComponent, { getInitialProps: true })
}
