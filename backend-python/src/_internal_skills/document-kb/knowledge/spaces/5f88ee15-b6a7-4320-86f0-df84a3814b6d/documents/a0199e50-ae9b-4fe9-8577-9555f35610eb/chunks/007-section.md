# 分布式一致性与负载均衡

47
5.Leader节点会将该写请求对应的⽇志发送给其他Follower节点，并等待Follower节点持久化⽇志成
功 
6.Follower节点收到⽇志后会进⾏持久化，如果持久化成功则发送⼀个Ack给Leader节点 
7. 当Leader节点收到半数以上的Ack后，就会开始提交，先更新Leader节点本地的内存数据 
8. 然后发送commit命令给Follower节点，Follower节点收到commit命令后就会更新各⾃本地内存数
据 
9. 同时Leader节点还是将当前写请求直接发送给O bserver节点，O bserver节点收到Leader发过来的
写请求后直接执⾏更新本地内存数据 
10. 最后Leader节点返回客户端写请求响应成功 
11. 通过同步机制和两阶段提交机制来达到集群中节点数据⼀致 
1. 随机：从多个服务提供者随机选择⼀个来处理本次请求，调⽤量越⼤则分布越均匀，并⽀持按权重
设置随机概率 
2. 轮询：依次选择服务提供者来处理请求， 并⽀持按权重进⾏轮询，底层采⽤的是平滑加权轮询算法 
3. 最⼩活跃调⽤数：统计服务提供者当前正在处理的请求，下次请求过来则交给活跃数最⼩的服务器
来处理 
4. ⼀致性哈希：相同参数的请求总是发到同⼀个服务提供者 
1. ⾸先Dubbo会将程序员所使⽤的@ DubboService注解或@ Service注解进⾏解析得到程序员所定义的
服务参数，包括定义的服务名、服务接⼝、服务超时时间、服务协议等等，得到⼀个
ServiceBean。 
2. 然后调⽤ServiceBean的export⽅法进⾏服务导出 
3. 然后将服务信息注册到注册中⼼，如果有多个协议，多个注册中⼼，那就将服务按单个协议，单个
注册中⼼进⾏注册 
4. 将服务信息注册到注册中⼼后，还会绑定⼀些监听器，监听动态配置中⼼的变更 
5. 还会根据服务协议启动对应的W eb服务器或⽹络框架，⽐如Tomcat、Netty等 
Dubbo⽀持哪些负载均衡策略 
Dubbo是如何完成服务导出的？ 
Dubbo是如何完成服务引⼊的？

48
1. 当程序员使⽤@ Reference注解来引⼊⼀个服务时，Dubbo会将注解和服务的信息解析出来，得到
当前所引⽤的服务名、服务接⼝是什么 
2. 然后从注册中⼼进⾏查询服务信息，得到服务的提供者信息，并存在消费端的服务⽬录中 
3. 并绑定⼀些监听器⽤来监听动态配置中⼼的变更 
4. 然后根据查询得到的服务提供者信息⽣成⼀个服务接⼝的代理对象，并放⼊Spring容器中作为Bean 
Dubbo中的架构设计是⾮常优秀的，分为了很多层次，并且每层都是可以扩展的，⽐如： 
1.Proxy服务代理层，⽀持JDK动态代理、javassist等代理机制 
2.Registry注册中⼼层，⽀持Zookeeper、Redis等作为注册中⼼ 
3.Protocol远程调⽤层，⽀持Dubbo、Http等调⽤协议 
4.Transport⽹络传输层，⽀持netty、mina等⽹络传输框架 
5.Serialize数据序列化层，⽀持JSO N、Hessian等序列化机制 
config 配置层：对外配置接⼝，以 ServiceConfig, ReferenceConfig 为中⼼，可以直接初
始化配置类，也可以通过 spring 解析配置⽣成配置类 
proxy 服务代理层：服务接⼝透明代理，⽣成服务的客户端 Stub 和服务器端 Skeleton, 以 
ServiceProxy 为中⼼，扩展接⼝为 ProxyFactory 
registry 注册中⼼层：封装服务地址的注册与发现，以服务 URL 为中⼼，扩展接⼝为 
RegistryFactory, Registry, RegistryService 
cluster 路由层：封装多个提供者的路由及负载均衡，并桥接注册中⼼，以 Invoker 为中⼼，扩
展接⼝为 Cluster, Directory, Router, LoadBalance 
m onitor 监控层：RPC 调⽤次数和调⽤时间监控，以 Statistics 为中⼼，扩展接⼝为 
MonitorFactory, Monitor, MonitorService 
protocol 远程调⽤层：封装 RPC 调⽤，以 Invocation, Result 为中⼼，扩展接⼝为 
Protocol, Invoker, Exporter 
exchange 信息交换层：封装请求响应模式，同步转异步，以 Request, Response 为中⼼，扩
展接⼝为 Exchanger, ExchangeChannel, ExchangeClient, ExchangeServer 
transport ⽹络传输层：抽象 mina 和 netty 为统⼀接⼝，以 Message 为中⼼，扩展接⼝为 
Channel, Transporter, Client, Server, Codec 
serialize 数据序列化层：可复⽤的⼀些⼯具，扩展接⼝为 Serialization, ObjectInput, 
ObjectOutput, ThreadPool 
Dubbo的架构设计是怎样的？ 
各层说明 
●
●
●
●
●
●
●
●
●
关系说明

49
在 RPC 中，Protocol 是核⼼层，也就是只要有 Protocol + Invoker + Exporter 就可以完成⾮透明
的 RPC 调⽤，然后在 Invoker 的主过程上 Filter 拦截点。 
图中的 Consumer 和 Provider 是抽象概念，只是想让看图者更直观的了解哪些类分属于客户端与
服务器端，不⽤ Client 和 Server 的原因是 Dubbo 在很多场景下都使⽤ Provider, Consumer, 
Registry, M onitor 划分逻辑拓普节点，保持统⼀概念。 
⽽ Cluster 是外围概念，所以 Cluster 的⽬的是将多个 Invoker 伪装成⼀个 Invoker，这样其它⼈
只要关注 Protocol 层 Invoker 即可，加上 Cluster 或者去掉 Cluster 对其它层都不会造成影响，因
为只有⼀个提供者时，是不需要 Cluster 的。 
Proxy 层封装了所有接⼝的透明化代理，⽽在其它层都以 Invoker 为中⼼，只有到了暴露给⽤户使
⽤时，才⽤ Proxy 将 Invoker 转成接⼝，或将接⼝实现转成 Invoker，也就是去掉 Proxy 层 RPC 
是可以 Run 的，只是不那么透明，不那么看起来像调本地服务⼀样调远程服务。 
⽽ Remoting 实现是 Dubbo 协议的实现，如果你选择 RM I 协议，整个 Remoting 都不会⽤上，
Remoting 内部再划为 Transport 传输层和 Exchange 信息交换层，Transport 层只负责单向消息
传输，是对 M ina, Netty, Grizzly 的抽象，它也可以扩展 UDP 传输，⽽ Exchange 层是在传输层
之上封装了 Request-Response 语义。 
Registry 和 M onitor 实际上不算⼀层，⽽是⼀个独⽴的节点，只是为了全局概览，⽤层的⽅式画在
⼀起。 
●
●
●
●
●
●

50
1、轮询法：将请求按顺序轮流地分配到后端服务器上，它均衡地对待后端的每⼀台服务器，⽽不关⼼服
务器实际的连接数和当前的系统负载。 
2、随机法：通过系统的随机算法，根据后端服务器的列表⼤⼩值来随机选取其中的⼀台服务器进⾏访
问。由概率统计理论可以得知，随着客户端调⽤服务端的次数增多，其实际效果越来越接近于平均分配
调⽤量到后端的每⼀台服务器，也就是轮询的结果。 
3、源地址哈希法：源地址哈希的思想是根据获取客户端的IP地址，通过哈希函数计算得到的⼀个数值，
⽤该数值对服务器列表的⼤⼩进⾏取模运算，得到的结果便是客服端要访问服务器的序号。采⽤源地址
哈希法进⾏负载均衡，同⼀IP地址的客户端，当后端服务器列表不变时，它每次都会映射到同⼀台后端
服务器进⾏访问。 
负载均衡算法有哪些
